"use server"

/**
 * Server Actions de «Mi cuenta». Cada una:
 * 1. `requerirPermiso("cuenta.gestionar")` (DAL): sesión al día; si no, 403.
 * 2. zod: el MISMO esquema que el formulario del cliente.
 * 3. Escribe con la sesión del USUARIO (RLS + privilegios de columna de
 *    `perfiles`: nombre, celular, preferencias, avatar_path) o con su sesión de
 *    Auth (contraseña, factores, cierre de sesiones). Nunca con la secret key
 *    sobre datos de negocio.
 * 4. Registra los eventos sensibles en `accesos`/`bitacora`.
 * Los errores esperados se devuelven como `ResultadoAccion` (nunca se lanzan).
 */
import "server-only"

import type { AuthError } from "@supabase/supabase-js"
import { refresh } from "next/cache"

import type { EnrolamientoMfa } from "@/features/auth/acciones-contrato"
import { urlDeDatosSvg } from "@/features/auth/qr"
import { mensajeErrorBd } from "@/features/usuarios/errores"
import { obtenerClaims, requerirPermiso } from "@/lib/auth/dal"
import { registrarAcceso, registrarEvento } from "@/lib/auth/registro"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { formatearFechaHora } from "@/lib/format"
import {
  desdeErrorZod,
  exito,
  fallo,
  type ResultadoAccion,
  type ResultadoFallo,
} from "@/lib/result"
import {
  type AuthServidor,
  obtenerAuthServidor,
} from "@/lib/supabase/auth-server"
import { crearClienteServidor } from "@/lib/supabase/server"

import { BUCKET_AVATARES, esRutaAvatarPropia, rutaAvatar } from "./avatar"
import {
  type CambiosPreferencias,
  esquemaCambiosPreferencias,
  fusionarPreferencias,
  leerPreferencias,
  type PreferenciasInterfaz,
} from "./preferencias"
import { PREFIJO_FACTOR_AUTOMATICO } from "./presentacion"
import { actividadPropia } from "./queries"
import {
  type EntradaCambioContrasena,
  type EntradaConfirmarFactor,
  type EntradaPerfil,
  esquemaCambioContrasena,
  esquemaCodigoActual,
  esquemaConfirmarFactor,
  esquemaFactor,
  esquemaPaginaActividad,
  esquemaPerfil,
  esquemaRutaAvatar,
} from "./schemas"
import {
  claveLimitadorCuenta,
  comprobarContrasenaActual,
  consultarBloqueo,
  informar,
  MENSAJE_INESPERADO,
  mensajeBloqueo,
  registrarIntento,
} from "./servidor"
import type { PaginaActividad } from "./tipos"

const PERMISO = "cuenta.gestionar"

const MENSAJES = {
  sinAvatares:
    "Las fotos de perfil aún no están disponibles. Mientras tanto, se muestran tus iniciales.",
  rutaInvalida: "La foto no corresponde a tu cuenta. Súbela de nuevo.",
  fotoNoSubida: "La foto no terminó de subir. Inténtalo de nuevo.",
  contrasenaIncorrecta: "La contraseña actual no es correcta.",
  mismaContrasena: "Elige una contraseña distinta de la actual.",
  contrasenaDebil:
    "Esa contraseña no es lo bastante segura. Prueba con una más larga y difícil de adivinar.",
  reautenticar:
    "Por seguridad, cierra sesión, vuelve a ingresar y repite el cambio.",
  demasiadosIntentos:
    "Hiciste demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.",
  codigoIncorrecto:
    "El código no es correcto o ya venció. Escribe el que muestra ahora tu app.",
  mfaObligatoria:
    "Tu rol exige la verificación en dos pasos: puedes cambiar de dispositivo, pero no desactivarla.",
  sinFactor: "No encontramos tu verificación en dos pasos. Recarga la página.",
} as const

function falloInesperado(operacion: string, error: unknown) {
  informar(operacion, error)
  return fallo(MENSAJE_INESPERADO)
}

// ── Perfil ───────────────────────────────────────────────────────────────────

export async function actualizarPerfil(
  entrada: EntradaPerfil
): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaPerfil.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const supabase = await crearClienteServidor()
    const { error } = await supabase
      .from("perfiles")
      .update(validacion.data)
      .eq("id", usuario.id)
    if (error) {
      informar("actualizarPerfil", error)
      return fallo(mensajeErrorBd(error))
    }
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("actualizarPerfil", error)
  }
}

// ── Foto de perfil (§8: ruta del servidor, subida con URL firmada) ──────────

export interface SubidaAvatar {
  ruta: string
  token: string
}

/** URL firmada de subida para una ruta nueva que construye el servidor. */
export async function prepararSubidaAvatar(): Promise<
  ResultadoAccion<SubidaAvatar>
> {
  const usuario = await requerirPermiso(PERMISO)
  try {
    const supabase = await crearClienteServidor()
    const ruta = rutaAvatar(usuario.id, crypto.randomUUID())
    const { data, error } = await supabase.storage
      .from(BUCKET_AVATARES)
      .createSignedUploadUrl(ruta)
    if (error) {
      informar("createSignedUploadUrl(avatares)", error)
      return fallo(MENSAJES.sinAvatares)
    }
    return exito({ ruta: data.path, token: data.token })
  } catch (error) {
    return falloInesperado("prepararSubidaAvatar", error)
  }
}

async function borrarFotoAnterior(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  anterior: string | null,
  nueva: string | null
): Promise<void> {
  if (!anterior || anterior === nueva) return
  const { error } = await supabase.storage
    .from(BUCKET_AVATARES)
    .remove([anterior])
  // Una foto huérfana no afecta a la persona: queda en el log para limpiarla.
  if (error) informar("remove(avatar anterior)", error)
}

async function fijarAvatar(
  usuario: UsuarioSesion,
  ruta: string | null
): Promise<ResultadoAccion> {
  const supabase = await crearClienteServidor()
  const { data: previo, error: errorLectura } = await supabase
    .from("perfiles")
    .select("avatar_path")
    .eq("id", usuario.id)
    .single()
  if (errorLectura) return falloInesperado("leer avatar_path", errorLectura)

  const { error } = await supabase
    .from("perfiles")
    .update({ avatar_path: ruta })
    .eq("id", usuario.id)
  if (error) return falloInesperado("actualizar avatar_path", error)

  await borrarFotoAnterior(supabase, previo.avatar_path, ruta)
  refresh()
  return exito()
}

/** Tras subir la foto: la ruta debe ser del propio perfil y existir en Storage. */
export async function confirmarAvatar(entrada: {
  ruta: string
}): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaRutaAvatar.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { ruta } = validacion.data
  if (!esRutaAvatarPropia(ruta, usuario.id)) return fallo(MENSAJES.rutaInvalida)
  try {
    const supabase = await crearClienteServidor()
    const { data: existe, error } = await supabase.storage
      .from(BUCKET_AVATARES)
      .exists(ruta)
    if (error || !existe) return fallo(MENSAJES.fotoNoSubida)
    return await fijarAvatar(usuario, ruta)
  } catch (error) {
    return falloInesperado("confirmarAvatar", error)
  }
}

export async function quitarAvatar(): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  try {
    return await fijarAvatar(usuario, null)
  } catch (error) {
    return falloInesperado("quitarAvatar", error)
  }
}

// ── Contraseña ───────────────────────────────────────────────────────────────

function falloActualizacion(error: AuthError) {
  switch (error.code) {
    case "same_password":
      return fallo(MENSAJES.mismaContrasena, {
        nueva: [MENSAJES.mismaContrasena],
      })
    case "weak_password":
      return fallo(MENSAJES.contrasenaDebil, {
        nueva: [MENSAJES.contrasenaDebil],
      })
    case "reauthentication_needed":
    case "insufficient_aal":
      return fallo(MENSAJES.reautenticar)
    default:
      return falloInesperado("updateUser(password)", error)
  }
}

/** Cierra las demás sesiones de la cuenta y lo deja en la bitácora. */
async function cerrarDemasSesiones(
  auth: AuthServidor,
  usuarioId: string,
  motivo: string
): Promise<boolean> {
  const { error } = await auth.signOut({ scope: "others" })
  if (error) {
    informar("signOut(others)", error)
    return false
  }
  await registrarEvento({
    actorId: usuarioId,
    accion: "CERRAR_SESIONES",
    entidad: "perfiles",
    entidadId: usuarioId,
    metadatos: { alcance: "otras", motivo },
  })
  return true
}

/**
 * Cambia la contraseña con la sesión del usuario. Antes comprueba la actual
 * (reautenticación, con el limitador de intentos): una sesión abierta en un
 * equipo ajeno no basta para quedarse con la cuenta.
 */
export async function cambiarContrasena(
  entrada: EntradaCambioContrasena
): Promise<ResultadoAccion<{ sesionesCerradas: boolean }>> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaCambioContrasena.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { actual, nueva, cerrarOtras } = validacion.data

  try {
    const clave = claveLimitadorCuenta("reautenticacion", usuario.id)
    const bloqueo = await consultarBloqueo(clave)
    if (bloqueo?.bloqueado) return fallo(mensajeBloqueo(bloqueo.reintentarEnS))

    const comprobacion = await comprobarContrasenaActual(usuario.email, actual)
    if (comprobacion === "limitada") return fallo(MENSAJES.demasiadosIntentos)
    await registrarIntento(clave, comprobacion === "correcta")
    if (comprobacion === "incorrecta") {
      return fallo(MENSAJES.contrasenaIncorrecta, {
        actual: [MENSAJES.contrasenaIncorrecta],
      })
    }

    const auth = await obtenerAuthServidor()
    const { error } = await auth.updateUser({ password: nueva })
    if (error) return falloActualizacion(error)

    const claims = await obtenerClaims()
    await registrarAcceso({
      evento: "CONTRASENA_CAMBIADA",
      usuarioId: usuario.id,
      email: usuario.email,
      sessionId: claims?.sessionId,
      aal: claims?.aal,
    })
    const sesionesCerradas = cerrarOtras
      ? await cerrarDemasSesiones(auth, usuario.id, "cambio_contrasena")
      : false
    // La cookie queda con un token emitido después del cambio.
    await auth.refreshSession()
    refresh()
    return exito({ sesionesCerradas })
  } catch (error) {
    return falloInesperado("cambiarContrasena", error)
  }
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

export async function cerrarOtrasSesiones(): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  try {
    const auth = await obtenerAuthServidor()
    const cerradas = await cerrarDemasSesiones(auth, usuario.id, "manual")
    if (!cerradas) return fallo(MENSAJE_INESPERADO)
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("cerrarOtrasSesiones", error)
  }
}

// ── Verificación en dos pasos ────────────────────────────────────────────────

/** Borra enrolamientos TOTP abandonados antes de crear uno nuevo. */
async function descartarFactoresSinVerificar(auth: AuthServidor) {
  const { data, error } = await auth.mfa.listFactors()
  if (error) throw error
  for (const factor of data.all) {
    if (factor.factor_type !== "totp" || factor.status !== "unverified")
      continue
    const { error: errorBorrado } = await auth.mfa.unenroll({
      factorId: factor.id,
    })
    if (errorBorrado) throw errorBorrado
  }
}

/**
 * Nuevo factor TOTP (activar o cambiar de dispositivo). El anterior sigue
 * activo hasta que el nuevo se confirme con un código: nunca queda la cuenta
 * sin verificación a mitad del cambio.
 */
export async function iniciarFactorMfa(): Promise<
  ResultadoAccion<EnrolamientoMfa>
> {
  await requerirPermiso(PERMISO)
  try {
    const auth = await obtenerAuthServidor()
    await descartarFactoresSinVerificar(auth)
    const { data, error } = await auth.mfa.enroll({
      factorType: "totp",
      // Supabase exige nombres únicos por cuenta: la fecha los distingue.
      friendlyName: `${PREFIJO_FACTOR_AUTOMATICO}${formatearFechaHora(new Date())}`,
      issuer: "AMO",
    })
    if (error) throw error
    return exito({
      factorId: data.id,
      qrSvg: urlDeDatosSvg(data.totp.qr_code),
      secreto: data.totp.secret,
      uri: data.totp.uri,
    })
  } catch (error) {
    return falloInesperado("mfa.enroll(cuenta)", error)
  }
}

/** Verifica un código con el limitador por cuenta (Auth solo limita por IP). */
async function verificarCodigo(
  auth: AuthServidor,
  usuarioId: string,
  factorId: string,
  codigo: string
): Promise<ResultadoFallo | null> {
  const clave = claveLimitadorCuenta("mfa-cuenta", usuarioId)
  const bloqueo = await consultarBloqueo(clave)
  if (bloqueo?.bloqueado) return fallo(mensajeBloqueo(bloqueo.reintentarEnS))

  const { error } = await auth.mfa.challengeAndVerify({
    factorId,
    code: codigo,
  })
  await registrarIntento(clave, !error)
  if (!error) return null
  if (error.status === 429) return fallo(MENSAJES.demasiadosIntentos)
  return fallo(MENSAJES.codigoIncorrecto, {
    codigo: [MENSAJES.codigoIncorrecto],
  })
}

async function retirarFactores(
  auth: AuthServidor,
  conservar: string | null
): Promise<void> {
  const { data, error } = await auth.mfa.listFactors()
  if (error) throw error
  for (const factor of data.totp) {
    if (factor.id === conservar) continue
    const { error: errorBorrado } = await auth.mfa.unenroll({
      factorId: factor.id,
    })
    if (errorBorrado) throw errorBorrado
  }
}

/**
 * Al cancelar la configuración: retira el factor recién creado si sigue sin
 * verificar (nunca toca uno verificado). Si falla, lo limpia el próximo intento.
 */
export async function cancelarFactorMfa(entrada: {
  factorId: string
}): Promise<ResultadoAccion> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaFactor.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const auth = await obtenerAuthServidor()
    const { data, error } = await auth.mfa.listFactors()
    if (error) throw error
    const pendiente = data.all.find(
      (factor) =>
        factor.id === validacion.data.factorId && factor.status === "unverified"
    )
    if (pendiente) {
      const { error: errorBorrado } = await auth.mfa.unenroll({
        factorId: pendiente.id,
      })
      if (errorBorrado) throw errorBorrado
    }
    return exito()
  } catch (error) {
    return falloInesperado("cancelarFactorMfa", error)
  }
}

/** Confirma el factor nuevo con su primer código y retira los anteriores. */
export async function confirmarFactorMfa(
  entrada: EntradaConfirmarFactor
): Promise<ResultadoAccion<{ reemplazo: boolean }>> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaConfirmarFactor.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  const { factorId, codigo } = validacion.data
  try {
    const auth = await obtenerAuthServidor()
    const rechazo = await verificarCodigo(auth, usuario.id, factorId, codigo)
    if (rechazo) return rechazo

    const { data } = await auth.mfa.listFactors()
    const reemplazo = (data?.totp ?? []).some(
      (factor) => factor.id !== factorId
    )
    await retirarFactores(auth, factorId)
    await registrarEvento({
      actorId: usuario.id,
      accion: "OTRO",
      entidad: "perfiles",
      entidadId: usuario.id,
      metadatos: {
        evento: reemplazo ? "MFA_RECONFIGURADA" : "MFA_ACTIVADA",
        factor: "totp",
      },
    })
    refresh()
    return exito({ reemplazo })
  } catch (error) {
    return falloInesperado("confirmarFactorMfa", error)
  }
}

/** Solo para roles que no la exigen; pide un código vigente como confirmación. */
export async function desactivarMfa(entrada: {
  codigo: string
}): Promise<ResultadoAccion> {
  const usuario = await requerirPermiso(PERMISO)
  if (usuario.rol.requiereMfa) return fallo(MENSAJES.mfaObligatoria)
  const validacion = esquemaCodigoActual.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const auth = await obtenerAuthServidor()
    const { data, error } = await auth.mfa.listFactors()
    if (error) throw error
    const factor = data.totp[0]
    if (!factor) return fallo(MENSAJES.sinFactor)

    const rechazo = await verificarCodigo(
      auth,
      usuario.id,
      factor.id,
      validacion.data.codigo
    )
    if (rechazo) return rechazo
    await retirarFactores(auth, null)
    await registrarEvento({
      actorId: usuario.id,
      accion: "OTRO",
      entidad: "perfiles",
      entidadId: usuario.id,
      metadatos: { evento: "MFA_DESACTIVADA", factor: "totp" },
    })
    await auth.refreshSession()
    refresh()
    return exito()
  } catch (error) {
    return falloInesperado("desactivarMfa", error)
  }
}

// ── Actividad ────────────────────────────────────────────────────────────────

export async function cargarActividad(entrada: {
  antesId: number
}): Promise<ResultadoAccion<PaginaActividad>> {
  await requerirPermiso(PERMISO)
  const validacion = esquemaPaginaActividad.safeParse(entrada)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    return exito(await actividadPropia(validacion.data.antesId))
  } catch (error) {
    return falloInesperado("cargarActividad", error)
  }
}

// ── Preferencias ─────────────────────────────────────────────────────────────

/**
 * Fusiona los cambios con lo guardado (conserva claves de otros módulos) y
 * devuelve las preferencias efectivas. Sin `refresh()`: la interfaz ya las
 * aplicó en caliente.
 */
export async function guardarPreferencias(
  cambios: CambiosPreferencias
): Promise<ResultadoAccion<PreferenciasInterfaz>> {
  const usuario = await requerirPermiso(PERMISO)
  const validacion = esquemaCambiosPreferencias.safeParse(cambios)
  if (!validacion.success) return desdeErrorZod(validacion.error)
  try {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("perfiles")
      .select("preferencias")
      .eq("id", usuario.id)
      .single()
    if (error) return falloInesperado("leer preferencias", error)

    const nuevas = fusionarPreferencias(data.preferencias, validacion.data)
    const { error: errorGuardado } = await supabase
      .from("perfiles")
      .update({ preferencias: nuevas })
      .eq("id", usuario.id)
    if (errorGuardado)
      return falloInesperado("guardar preferencias", errorGuardado)
    return exito(leerPreferencias(nuevas))
  } catch (error) {
    return falloInesperado("guardarPreferencias", error)
  }
}
