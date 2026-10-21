/**
 * `pnpm bootstrap:superadmin` — crea (o retoma) el superadministrador inicial.
 *
 * 1. Genera con la Admin API un enlace `invite` (si la cuenta no existe o no ha
 *    confirmado el correo) o `recovery` (si ya existe). `generateLink` crea el
 *    usuario de Auth y `handle_new_user` su perfil denegado por defecto.
 * 2. Fija `app_metadata.rol` y el rol SUPERADMIN del perfil, sin tocar
 *    `estado` (solo cambia por transición: AMO_ESTADO_SOLO_VIA_TRANSICION). Es
 *    la excepción de arranque de `fn_guardar_perfil`: sin actor solo se permite
 *    mientras no exista ningún SUPERADMIN activo (docs/modelo-datos.md §5.4).
 *    La cuenta INVITADA se activa al confirmar el enlace (`confirmarEnlace` →
 *    `activar_perfil_srv`); si el correo ya estaba confirmado, aquí mismo.
 *    Una cuenta suspendida o desactivada no se toca: la reactiva otro
 *    SUPERADMIN desde Usuarios (transición con motivo). El primer ingreso
 *    sigue exigiendo contraseña nueva y MFA (DAL §2.6).
 * 3. Registra la invitación en la bitácora (sin el token) e imprime SOLO el
 *    enlace `${NEXT_PUBLIC_SITE_URL}/auth/confirm?token_hash=…&type=…`.
 *
 * Idempotente: volver a ejecutarlo solo genera un enlace nuevo.
 */
import type { User } from "@supabase/supabase-js"

import { esCuentaNoInvitada } from "../../src/features/usuarios/cuentas-no-invitadas"
import { argumentosRpc } from "../../src/lib/supabase/rpc"
import { requiereTransicionHumana } from "./estado-perfil"
import {
  activarPerfil,
  buscarUsuarioPorEmail,
  type ClienteSupabase,
  crearClienteServicio,
  enlaceConfirmacion,
  cargarEntorno,
  actualizarPerfil,
  ErrorBootstrap,
  idDeRol,
} from "./supabase"

const ROL = "SUPERADMIN"

async function generarEnlace(
  servicio: ClienteSupabase,
  email: string,
  tipo: "invite" | "recovery"
) {
  const { data, error } = await servicio.auth.admin.generateLink({
    type: tipo,
    email,
  })
  if (error) {
    throw new ErrorBootstrap(`No se pudo generar el enlace: ${error.message}`)
  }
  return {
    usuario: data.user,
    tokenHash: data.properties.hashed_token,
  }
}

async function asegurarAppMetadata(
  servicio: ClienteSupabase,
  usuario: User
): Promise<void> {
  if (usuario.app_metadata.rol === ROL) return
  const { error } = await servicio.auth.admin.updateUserById(usuario.id, {
    app_metadata: { ...usuario.app_metadata, rol: ROL },
  })
  if (error) {
    throw new ErrorBootstrap(`No se pudo fijar app_metadata: ${error.message}`)
  }
}

async function asegurarPerfil(
  servicio: ClienteSupabase,
  usuario: User
): Promise<void> {
  const rolId = await idDeRol(servicio, ROL)
  const { data: perfil, error } = await servicio
    .from("perfiles")
    .select("rol_id, estado")
    .eq("id", usuario.id)
    .single()
  if (error) {
    throw new ErrorBootstrap(`No se encontró el perfil: ${error.message}`)
  }
  if (requiereTransicionHumana(perfil.estado)) {
    throw new ErrorBootstrap(
      `La cuenta está ${perfil.estado.toLowerCase()}: el arranque no cambia estados. Otro superadministrador debe reactivarla desde Usuarios.`
    )
  }
  if (perfil.rol_id !== rolId) {
    await actualizarPerfil(servicio, usuario.id, { rol_id: rolId })
  }
  if (perfil.estado === "INVITADO" && usuario.email_confirmed_at) {
    await activarPerfil(servicio, usuario.id)
  }
}

async function registrarEnBitacora(
  servicio: ClienteSupabase,
  usuarioId: string,
  tipo: "invite" | "recovery"
): Promise<void> {
  const { error } = await servicio.rpc(
    "registrar_evento_srv",
    argumentosRpc<"registrar_evento_srv">({
      p_actor_id: null,
      p_accion: tipo === "invite" ? "INVITAR" : "GENERAR_ENLACE",
      p_entidad: "perfiles",
      p_entidad_id: usuarioId,
      p_metadatos: { tipo, rol: ROL, origen: "bootstrap:superadmin" },
      p_ip: null,
      p_pais: null,
      p_ciudad: null,
      p_ua: null,
    })
  )
  if (error) {
    throw new ErrorBootstrap(
      `No se pudo registrar en la bitácora: ${error.message}`
    )
  }
}

/**
 * Una cuenta INVITADA sin rol no la creó AMO (p. ej. alguien se registró con
 * ese correo mientras los registros públicos de Auth estaban activos): quien
 * lo hizo conoce su contraseña. Se borra y se invita desde cero; si no, al
 * confirmar el enlace esa contraseña daría acceso a la cuenta SUPERADMIN.
 */
async function descartarRegistroExterno(
  servicio: ClienteSupabase,
  usuario: User | null
): Promise<User | null> {
  if (!usuario) return null
  const { data: perfil, error } = await servicio
    .from("perfiles")
    .select("estado, rol_id")
    .eq("id", usuario.id)
    .single()
  if (error) {
    throw new ErrorBootstrap(`No se encontró el perfil: ${error.message}`)
  }
  if (!esCuentaNoInvitada(perfil)) return usuario

  const { error: errorBorrado } = await servicio.auth.admin.deleteUser(
    usuario.id
  )
  if (errorBorrado) {
    throw new ErrorBootstrap(
      `No se pudo descartar la cuenta no invitada: ${errorBorrado.message}`
    )
  }
  process.stderr.write(
    "Se descartó una cuenta con ese correo que no nació de una invitación de AMO.\n"
  )
  return null
}

async function main(): Promise<void> {
  const entorno = cargarEntorno()
  const email = entorno.superadminEmail
  if (!email) throw new ErrorBootstrap("Define SUPERADMIN_EMAIL en .env.local.")

  const servicio = crearClienteServicio(entorno)
  const existente = await descartarRegistroExterno(
    servicio,
    await buscarUsuarioPorEmail(servicio, email)
  )
  const tipo = existente?.email_confirmed_at ? "recovery" : "invite"

  const { usuario, tokenHash } = await generarEnlace(servicio, email, tipo)
  await asegurarAppMetadata(servicio, usuario)
  await asegurarPerfil(servicio, usuario)
  await registrarEnBitacora(servicio, usuario.id, tipo)

  process.stdout.write(
    `${enlaceConfirmacion(entorno.sitioUrl, tokenHash, tipo)}\n`
  )
}

main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error)
  process.stderr.write(`bootstrap:superadmin falló: ${mensaje}\n`)
  process.exitCode = 1
})
