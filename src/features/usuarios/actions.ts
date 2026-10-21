"use server"

/**
 * Server Actions de Usuarios. Patrón de cada acción (docs/modelo-datos.md
 * §2.4.4 y §5.4):
 *
 * 1. `requerirPermiso` (DAL): sesión al día + permiso del catálogo; si no, 403.
 * 2. zod: el MISMO esquema que el formulario del cliente.
 * 3. Escritura con la secret key y el actor en `x-amo-actor`; la BD revalida
 *    actor, sesión, permiso y anti-escalada (`*_srv` o trigger guardián) y
 *    audita con el actor real. La Admin API de Auth (que no pasa por
 *    triggers) va siempre DESPUÉS de `autorizar_gestion_usuario_srv`.
 * 4. Bitácora de los eventos de aplicación (nunca enlaces ni contraseñas).
 * 5. `refresh()` para que la página muestre el cambio en la misma respuesta.
 *
 * Los errores esperados se devuelven como `ResultadoAccion` (nunca se lanzan).
 */
import "server-only"

import { refresh } from "next/cache"

import { type ContextoActor, contextoDelActor } from "@/lib/auth/contexto-actor"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"
import { registrarAcceso, registrarEvento } from "@/lib/auth/registro"
import { getEnvServidor } from "@/lib/env.server"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import { argumentosRpc } from "@/lib/supabase/rpc"

import { generarContrasenaTemporal } from "./contrasena-temporal"
import {
  esCuentaNoInvitada,
  MENSAJE_CUENTA_NO_INVITADA,
} from "./cuentas-no-invitadas"
import { enlaceConfirmacion, type TipoEnlace } from "./enlaces"
import { rolesAsignables } from "./queries"
import {
  conReglasDeRol,
  type DatosCrearUsuario,
  type EntradaCrearUsuario,
  type EntradaEditarUsuario,
  type EntradaMotivo,
  esquemaCrearUsuario,
  esquemaEditarUsuario,
  esquemaEliminar,
  esquemaExportacion,
  esquemaMasivo,
  esquemaMotivo,
  esquemaUsuarioId,
} from "./schemas"
import {
  autorizarGestion,
  BLOQUEO_INDEFINIDO,
  falloAuth,
  falloBd,
  falloInesperado,
  informar,
  informarSiInesperado,
  SIN_BLOQUEO,
  SITIO,
} from "./servidor"
import type { CredencialEntregada, RolAsignable, UsuarioCreado } from "./tipos"

// ── Utilidades internas (no exportadas: no son acciones) ─────────────────────

function organizacionesDelRol(
  rol: RolAsignable,
  organizacionId: string | null
) {
  return {
    anunciante_id: rol.tipo === "ANUNCIANTE" ? organizacionId : null,
    medio_id: rol.tipo === "MEDIO" ? organizacionId : null,
  }
}

/** `app_metadata.rol` es informativo (claims); la autoridad es `perfiles.rol_id`. */
async function sincronizarRolEnAuth(
  contexto: ContextoActor,
  usuarioId: string,
  clave: string
): Promise<void> {
  const { error } = await contexto.admin.auth.admin.updateUserById(usuarioId, {
    app_metadata: { rol: clave },
  })
  if (error) informar("updateUserById(app_metadata)", error)
}

/** Bloqueo en Auth: impide ingresar y verificar enlaces mientras dure. */
async function fijarBloqueo(
  contexto: ContextoActor,
  usuarioId: string,
  duracion: string
): Promise<void> {
  const { error } = await contexto.admin.auth.admin.updateUserById(usuarioId, {
    ban_duration: duracion,
  })
  if (error) informar(`updateUserById(ban ${duracion})`, error)
}

interface AltaAuth {
  usuarioId: string
  credencial: CredencialEntregada
}

/** Crea la cuenta en Auth según el método; `handle_new_user` crea su perfil denegado. */
async function crearCuentaAuth(
  contexto: ContextoActor,
  datos: DatosCrearUsuario,
  rol: RolAsignable
): Promise<ResultadoAccion<AltaAuth>> {
  const auth = contexto.admin.auth.admin
  if (datos.metodo === "CONTRASENA") {
    const contrasena = generarContrasenaTemporal()
    const { data, error } = await auth.createUser({
      email: datos.email,
      password: contrasena,
      email_confirm: true,
      app_metadata: { rol: rol.clave },
    })
    if (error) return falloAuth("createUser", error)
    return exito({
      usuarioId: data.user.id,
      credencial: { tipo: "CONTRASENA", contrasena },
    })
  }

  // Supabase guarda un solo token por tipo: si el correo lo envía Auth, el
  // enlace no puede además mostrarse (generarlo invalidaría el del correo).
  if (getEnvServidor().AMO_SMTP_CONFIGURADO) {
    const { data, error } = await auth.inviteUserByEmail(datos.email, {
      redirectTo: `${SITIO}/auth/confirm`,
    })
    if (error) return falloAuth("inviteUserByEmail", error)
    await sincronizarRolEnAuth(contexto, data.user.id, rol.clave)
    return exito({ usuarioId: data.user.id, credencial: { tipo: "CORREO" } })
  }

  const { data, error } = await auth.generateLink({
    type: "invite",
    email: datos.email,
  })
  if (error) return falloAuth("generateLink(invite)", error)
  await sincronizarRolEnAuth(contexto, data.user.id, rol.clave)
  return exito({
    usuarioId: data.user.id,
    credencial: {
      tipo: "ENLACE",
      enlace: enlaceConfirmacion(SITIO, data.properties.hashed_token, "invite"),
      proposito: "invitacion",
    },
  })
}

/**
 * Rol, organización y datos del perfil (el trigger guardián aplica la
 * anti-escalada con el actor real). Con contraseña temporal la cuenta queda
 * ACTIVA de una vez (transición ADMIN INVITADO → ACTIVO, §4.2).
 */
async function completarPerfil(
  contexto: ContextoActor,
  usuarioId: string,
  datos: DatosCrearUsuario,
  rol: RolAsignable
): Promise<ResultadoAccion<null>> {
  const { error } = await contexto.admin
    .from("perfiles")
    .update({
      nombre: datos.nombre,
      celular: datos.celular,
      rol_id: rol.id,
      ...organizacionesDelRol(rol, datos.organizacionId),
      invitado_por: contexto.actorId,
      debe_cambiar_password: true,
    })
    .eq("id", usuarioId)
  if (error) return falloBd("completar perfil", error)

  if (datos.metodo === "CONTRASENA") {
    const { error: errorTransicion } = await contexto.admin.rpc(
      "transicionar_srv",
      argumentosRpc<"transicionar_srv">({
        p_entidad: "perfiles",
        p_id: usuarioId,
        p_hacia: "ACTIVO",
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_motivo: null,
        p_datos: {},
      })
    )
    if (errorTransicion)
      return falloBd("activar con contraseña", errorTransicion)
  }
  return exito(null)
}

/** Compensa un alta a medias: sin perfil completo no debe quedar cuenta en Auth. */
async function deshacerAlta(
  contexto: ContextoActor,
  usuarioId: string
): Promise<void> {
  const { error } = await contexto.admin.auth.admin.deleteUser(usuarioId)
  if (error) informar("deleteUser(compensación)", error)
}

async function perfilPorEmail(contexto: ContextoActor, email: string) {
  const { data, error } = await contexto.admin
    .from("perfiles")
    .select("id, estado, rol_id")
    .eq("email", email)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Borra una cuenta que no nació de una invitación de AMO (ver
 * `cuentas-no-invitadas.ts`) para invitar al correo desde cero: su contraseña,
 * elegida por quien se registró, deja de existir.
 */
async function descartarCuentaNoInvitada(
  contexto: ContextoActor,
  usuarioId: string
): Promise<ResultadoAccion<null>> {
  const { error } = await contexto.admin.auth.admin.deleteUser(usuarioId)
  if (error) return falloAuth("deleteUser(cuenta no invitada)", error)
  await registrarEvento({
    actorId: contexto.actorId,
    admin: contexto.admin,
    accion: "OTRO",
    entidad: "perfiles",
    entidadId: usuarioId,
    metadatos: { evento: "CUENTA_NO_INVITADA_DESCARTADA" },
  })
  return exito(null)
}

/** `null` si el correo está libre (o quedó libre); si no, el error para el formulario. */
async function liberarCorreo(
  contexto: ContextoActor,
  email: string
): Promise<ResultadoFallo | null> {
  const existente = await perfilPorEmail(contexto, email)
  if (!existente) return null
  if (esCuentaNoInvitada(existente)) {
    const descarte = await descartarCuentaNoInvitada(contexto, existente.id)
    return descarte.ok ? null : descarte
  }
  const mensaje =
    existente.estado === "DESACTIVADO"
      ? "Ese correo pertenece a una cuenta desactivada."
      : "Ya existe una cuenta con ese correo."
  return fallo(mensaje, { email: [mensaje] })
}

async function transicionar(
  contexto: ContextoActor,
  usuarioId: string,
  hacia: "ACTIVO" | "DESACTIVADO",
  motivo: string
) {
  return contexto.admin.rpc(
    "transicionar_srv",
    argumentosRpc<"transicionar_srv">({
      p_entidad: "perfiles",
      p_id: usuarioId,
      p_hacia: hacia,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_motivo: motivo,
      p_datos: {},
    })
  )
}

async function cerrarSesiones(
  contexto: ContextoActor,
  usuarioId: string,
  motivo: string | null
) {
  return contexto.admin.rpc(
    "cerrar_sesiones_usuario_srv",
    argumentosRpc<"cerrar_sesiones_usuario_srv">({
      p_usuario_id: usuarioId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      // Sobre la propia cuenta se conserva la sesión actual.
      p_excepto_session:
        usuarioId === contexto.actorId ? contexto.sessionId : null,
      p_motivo: motivo,
    })
  )
}

// ── Alta y edición ───────────────────────────────────────────────────────────

/**
 * Crea un usuario por enlace de invitación (se muestra UNA vez; con SMTP lo
 * envía Supabase) o con contraseña temporal (se muestra UNA vez y debe
 * cambiarla al primer ingreso). El rol debe estar entre los asignables.
 */
export async function crearUsuario(
  entrada: EntradaCrearUsuario
): Promise<ResultadoAccion<UsuarioCreado>> {
  const actor = await requerirPermiso("usuarios.invitar")
  const roles = await rolesAsignables()
  const validacion = conReglasDeRol(esquemaCrearUsuario, roles).safeParse(
    entrada
  )
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const rol = roles.find((candidato) => candidato.id === datos.rolId)
  if (!rol)
    return fallo("No puedes asignar ese rol.", {
      rolId: ["No puedes asignar ese rol."],
    })

  try {
    const contexto = await contextoDelActor(actor)
    // Autoriza antes de mirar si el correo existe (ni siquiera eso se revela sin permiso).
    const denegado = await autorizarGestion(contexto, null, "INVITAR")
    if (denegado) return falloBd("autorizar invitación", denegado)
    const ocupado = await liberarCorreo(contexto, datos.email)
    if (ocupado) return ocupado

    const alta = await crearCuentaAuth(contexto, datos, rol)
    if (!alta.ok) return alta
    const perfil = await completarPerfil(
      contexto,
      alta.datos.usuarioId,
      datos,
      rol
    )
    if (!perfil.ok) {
      await deshacerAlta(contexto, alta.datos.usuarioId)
      return perfil
    }

    await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "INVITAR",
      entidad: "perfiles",
      entidadId: alta.datos.usuarioId,
      metadatos: {
        metodo: datos.metodo,
        rol: rol.clave,
        correo_enviado: alta.datos.credencial.tipo === "CORREO",
      },
    })
    refresh()
    return exito({
      usuarioId: alta.datos.usuarioId,
      email: datos.email,
      credencial: alta.datos.credencial,
    })
  } catch (error) {
    return falloInesperado("crearUsuario", error)
  }
}

/** Nombre, celular, rol y organización. Nadie cambia su propio rol. */
export async function editarUsuario(
  entrada: EntradaEditarUsuario
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.editar")
  const roles = await rolesAsignables()
  const validacion = conReglasDeRol(esquemaEditarUsuario, roles).safeParse(
    entrada
  )
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const datos = validacion.data
  const rol = roles.find((candidato) => candidato.id === datos.rolId)
  if (!rol)
    return fallo("No puedes asignar ese rol.", {
      rolId: ["No puedes asignar ese rol."],
    })
  if (datos.usuarioId === actor.id && datos.rolId !== actor.rol.id) {
    return fallo("No puedes cambiar tu propio rol.", {
      rolId: ["No puedes cambiar tu propio rol."],
    })
  }

  try {
    const contexto = await contextoDelActor(actor)
    const denegado = await autorizarGestion(contexto, datos.usuarioId, "EDITAR")
    if (denegado) return falloBd("autorizar edición", denegado)

    const { data: anterior, error: errorLectura } = await contexto.admin
      .from("perfiles")
      .select("rol_id, estado")
      .eq("id", datos.usuarioId)
      .single()
    if (errorLectura) return falloBd("leer perfil", errorLectura)
    if (esCuentaNoInvitada(anterior)) return fallo(MENSAJE_CUENTA_NO_INVITADA)

    const { error } = await contexto.admin
      .from("perfiles")
      .update({
        nombre: datos.nombre,
        celular: datos.celular,
        rol_id: rol.id,
        ...organizacionesDelRol(rol, datos.organizacionId),
      })
      .eq("id", datos.usuarioId)
    if (error) return falloBd("editar perfil", error)

    if (anterior.rol_id !== rol.id) {
      await sincronizarRolEnAuth(contexto, datos.usuarioId, rol.clave)
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("editarUsuario", error)
  }
}

// ── Estado de la cuenta ──────────────────────────────────────────────────────

/** ACTIVO → SUSPENDIDO: cierra sus sesiones y la bloquea en Auth. */
export async function suspenderUsuario(
  entrada: EntradaMotivo
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.suspender")
  const validacion = esquemaMotivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { usuarioId, motivo } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc("suspender_usuario_srv", {
      p_usuario_id: usuarioId,
      p_actor_id: contexto.actorId,
      p_session_id: contexto.sessionId,
      p_motivo: motivo,
    })
    if (error) return falloBd("suspender", error)
    await fijarBloqueo(contexto, usuarioId, BLOQUEO_INDEFINIDO)
    await registrarAcceso({ evento: "USUARIO_SUSPENDIDO", usuarioId })
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("suspenderUsuario", error)
  }
}

/** SUSPENDIDO → ACTIVO y fin del bloqueo en Auth. */
export async function reactivarUsuario(
  entrada: EntradaMotivo
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.suspender")
  const validacion = esquemaMotivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { usuarioId, motivo } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(contexto, usuarioId, "ACTIVO", motivo)
    if (error) return falloBd("reactivar", error)
    await fijarBloqueo(contexto, usuarioId, SIN_BLOQUEO)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("reactivarUsuario", error)
  }
}

/**
 * Baja lógica (→ DESACTIVADO, `deleted_at`): desde INVITADO es "revocar
 * invitación" (`usuarios.invitar`); desde ACTIVO o SUSPENDIDO exige
 * `usuarios.eliminar`. La BD decide cuál aplica según el estado actual.
 */
export async function desactivarUsuario(
  entrada: EntradaMotivo
): Promise<ResultadoAccion> {
  const actor = await requerirPermiso(["usuarios.eliminar", "usuarios.invitar"])
  const validacion = esquemaMotivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { usuarioId, motivo } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await transicionar(
      contexto,
      usuarioId,
      "DESACTIVADO",
      motivo
    )
    if (error) return falloBd("desactivar", error)
    await fijarBloqueo(contexto, usuarioId, BLOQUEO_INDEFINIDO)
    // Sus sesiones ya no pasan acceso_valido(); cerrarlas es higiene si hay permiso.
    if (tieneAlgunPermiso(actor, ["usuarios.cerrar_sesiones"])) {
      const { error: errorSesiones } = await cerrarSesiones(
        contexto,
        usuarioId,
        motivo
      )
      if (errorSesiones)
        informar("cerrar sesiones al desactivar", errorSesiones)
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("desactivarUsuario", error)
  }
}

/**
 * Borrado definitivo (solo SUPERADMIN y solo cuentas DESACTIVADAS; lo
 * garantiza `eliminar_usuario_srv`). La bitácora conserva un snapshot mínimo.
 */
export async function eliminarUsuario(entrada: {
  usuarioId: string
  confirmacion: string
}): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.eliminar")
  if (actor.rol.clave !== "SUPERADMIN") {
    return fallo(
      "Solo un superadministrador puede eliminar cuentas definitivamente."
    )
  }
  const validacion = esquemaEliminar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { error } = await contexto.admin.rpc(
      "eliminar_usuario_srv",
      argumentosRpc<"eliminar_usuario_srv">({
        p_usuario_id: validacion.data.usuarioId,
        p_actor_id: contexto.actorId,
        p_session_id: contexto.sessionId,
        p_motivo: "Eliminación definitiva desde la administración de usuarios",
      })
    )
    if (error) return falloBd("eliminar", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("eliminarUsuario", error)
  }
}

// ── Seguridad y acceso ───────────────────────────────────────────────────────

/**
 * Borra sus factores TOTP y cierra sus sesiones: al volver a ingresar deberá
 * configurar la verificación en dos pasos (compuerta 5 del DAL).
 */
export async function restablecerMfa(entrada: {
  usuarioId: string
}): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.editar")
  if (!tieneAlgunPermiso(actor, ["usuarios.cerrar_sesiones"])) {
    return fallo(
      "Restablecer la verificación también cierra sus sesiones: necesitas ese permiso."
    )
  }
  const validacion = esquemaUsuarioId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { usuarioId } = validacion.data
  if (usuarioId === actor.id) {
    return fallo(
      "Para cambiar tu propia verificación en dos pasos usa Mi cuenta."
    )
  }

  try {
    const contexto = await contextoDelActor(actor)
    const denegado = await autorizarGestion(contexto, usuarioId, "EDITAR")
    if (denegado) return falloBd("autorizar restablecer MFA", denegado)

    const auth = contexto.admin.auth.admin.mfa
    const { data, error } = await auth.listFactors({ userId: usuarioId })
    if (error) return falloAuth("mfa.listFactors", error)
    for (const factor of data.factors) {
      const { error: errorBorrado } = await auth.deleteFactor({
        id: factor.id,
        userId: usuarioId,
      })
      if (errorBorrado) return falloAuth("mfa.deleteFactor", errorBorrado)
    }
    const { error: errorSesiones } = await cerrarSesiones(
      contexto,
      usuarioId,
      "Restablecimiento de la verificación en dos pasos"
    )
    if (errorSesiones)
      return falloBd("cerrar sesiones tras restablecer MFA", errorSesiones)

    await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "OTRO",
      entidad: "perfiles",
      entidadId: usuarioId,
      metadatos: { evento: "MFA_RESTABLECIDA", factores: data.factors.length },
    })
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("restablecerMfa", error)
  }
}

/** Al próximo ingreso (o navegación) deberá crear una contraseña nueva. */
export async function forzarCambioContrasena(entrada: {
  usuarioId: string
}): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.editar")
  const validacion = esquemaUsuarioId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { usuarioId } = validacion.data
  if (usuarioId === actor.id) {
    return fallo("Para cambiar tu propia contraseña usa Mi cuenta.")
  }

  try {
    const contexto = await contextoDelActor(actor)
    const denegado = await autorizarGestion(contexto, usuarioId, "EDITAR")
    if (denegado) return falloBd("autorizar forzar cambio", denegado)
    const { error } = await contexto.admin
      .from("perfiles")
      .update({ debe_cambiar_password: true })
      .eq("id", usuarioId)
    if (error) return falloBd("forzar cambio de contraseña", error)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("forzarCambioContrasena", error)
  }
}

/**
 * Enlace de un solo uso para compartir por un canal seguro: invitación nueva
 * si aún no la aceptó, o recuperación de contraseña si ya está activa. Se
 * devuelve una sola vez y nunca se registra (la bitácora guarda solo el tipo).
 */
export async function generarEnlaceAcceso(entrada: {
  usuarioId: string
}): Promise<ResultadoAccion<CredencialEntregada>> {
  const actor = await requerirPermiso([
    "usuarios.invitar",
    "usuarios.generar_enlace",
  ])
  const validacion = esquemaUsuarioId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { usuarioId } = validacion.data

  try {
    const contexto = await contextoDelActor(actor)
    const { data: perfil, error } = await contexto.admin
      .from("perfiles")
      .select("email, estado, rol_id")
      .eq("id", usuarioId)
      .single()
    if (error) return falloBd("leer perfil para enlace", error)

    const tipo: TipoEnlace =
      perfil.estado === "INVITADO" ? "invite" : "recovery"
    if (tipo === "recovery" && perfil.estado !== "ACTIVO") {
      return fallo("Solo las cuentas activas pueden recuperar su contraseña.")
    }
    const denegado = await autorizarGestion(
      contexto,
      usuarioId,
      tipo === "invite" ? "INVITAR" : "GENERAR_ENLACE"
    )
    if (denegado) return falloBd("autorizar enlace", denegado)
    // Confirmar el correo de un registro externo activaría la contraseña de quien se registró.
    if (esCuentaNoInvitada(perfil)) return fallo(MENSAJE_CUENTA_NO_INVITADA)

    const { data, error: errorEnlace } =
      await contexto.admin.auth.admin.generateLink({
        type: tipo,
        email: perfil.email,
      })
    if (errorEnlace) return falloAuth(`generateLink(${tipo})`, errorEnlace)

    await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "GENERAR_ENLACE",
      entidad: "perfiles",
      entidadId: usuarioId,
      metadatos: { tipo },
    })
    refresh()
    return exito({
      tipo: "ENLACE",
      enlace: enlaceConfirmacion(SITIO, data.properties.hashed_token, tipo),
      proposito: tipo === "invite" ? "invitacion" : "recuperacion",
    })
  } catch (error) {
    return falloInesperado("generarEnlaceAcceso", error)
  }
}

/** Revoca todas sus sesiones abiertas (el refresh token deja de servir). */
export async function cerrarSesionesUsuario(entrada: {
  usuarioId: string
}): Promise<ResultadoAccion<{ cerradas: number }>> {
  const actor = await requerirPermiso("usuarios.cerrar_sesiones")
  const validacion = esquemaUsuarioId.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    const { data, error } = await cerrarSesiones(
      contexto,
      validacion.data.usuarioId,
      "Cierre desde la administración de usuarios"
    )
    if (error) return falloBd("cerrar sesiones", error)
    refresh()
    return exito({ cerradas: data })
  } catch (error) {
    return falloInesperado("cerrarSesionesUsuario", error)
  }
}

/**
 * Acción masiva: cierra las sesiones de varios usuarios. Cada uno se valida
 * por separado en la BD (anti-escalada); se informa cuántos no se pudieron.
 */
export async function cerrarSesionesMasivo(entrada: {
  usuarioIds: string[]
}): Promise<
  ResultadoAccion<{ usuarios: number; sesiones: number; omitidos: number }>
> {
  const actor = await requerirPermiso("usuarios.cerrar_sesiones")
  const validacion = esquemaMasivo.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const objetivos = [...new Set(validacion.data.usuarioIds)].filter(
    (id) => id !== actor.id
  )

  try {
    const contexto = await contextoDelActor(actor)
    let usuarios = 0
    let sesiones = 0
    // Secuencial: cada llamada toma sus bloqueos y registra su propia bitácora.
    for (const usuarioId of objetivos) {
      const { data, error } = await cerrarSesiones(
        contexto,
        usuarioId,
        "Cierre masivo"
      )
      if (error) {
        informarSiInesperado("cerrar sesiones (masivo)", error)
        continue
      }
      usuarios += 1
      sesiones += data
    }
    refresh()
    return exito({
      usuarios,
      sesiones,
      omitidos: validacion.data.usuarioIds.length - usuarios,
    })
  } catch (error) {
    return falloInesperado("cerrarSesionesMasivo", error)
  }
}

/** Deja constancia de la exportación del listado (formato y filas, sin datos). */
export async function registrarExportacionUsuarios(entrada: {
  formato: "csv" | "xlsx"
  filas: number
}): Promise<ResultadoAccion> {
  const actor = await requerirPermiso("usuarios.ver")
  const validacion = esquemaExportacion.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)

  try {
    const contexto = await contextoDelActor(actor)
    await registrarEvento({
      actorId: contexto.actorId,
      admin: contexto.admin,
      accion: "EXPORTAR",
      entidad: "usuarios",
      entidadId: null,
      metadatos: {
        formato: validacion.data.formato,
        filas: validacion.data.filas,
      },
    })
    return exito()
  } catch (error) {
    return falloInesperado("registrarExportacionUsuarios", error)
  }
}
