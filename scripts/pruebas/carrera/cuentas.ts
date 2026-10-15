/**
 * Cuentas de la prueba de carrera: un operador ADMIN con TOTP (las
 * transiciones de preparación exigen sesión aal2) y un usuario MEDIO por
 * cada medio. Todas son `es_demo` en `@amo.test` y se borran al terminar.
 */
import { AuthApiError } from "@supabase/supabase-js"

import { generarContrasena } from "../../bootstrap/contrasena"
import { codigoTotpEstable } from "../../bootstrap/provision-e2e"
import {
  actualizarPerfil,
  type ClienteSupabase,
  crearClientePublico,
  type EntornoBootstrap,
  idDeRol,
} from "../../bootstrap/supabase"
import { sessionIdDeToken } from "./invariantes"

/** Usuario con sesión viva: lo que `validar_actor` revalida en cada `*_srv`. */
export interface Actor {
  usuarioId: string
  sesionId: string
  /** Cliente con la sesión del usuario (para RPC de lectura como él). */
  cliente: ClienteSupabase
}

export const PREFIJO_EMAIL = "e2e.carrera-"
export const SUFIJO_OPERADOR = "-operador@"

export function emailOperador(corrida: string): string {
  return `${PREFIJO_EMAIL}${corrida}${SUFIJO_OPERADOR}amo.test`
}

export function emailMedio(corrida: string, indice: number): string {
  return `${PREFIJO_EMAIL}${corrida}-m${indice}@amo.test`
}

const ESPERA_LIMITE_MS = 60_000
const REINTENTOS_LIMITE = 6

const esperar = (ms: number) =>
  new Promise((resolver) => setTimeout(resolver, ms))

export async function crearUsuario(
  servicio: ClienteSupabase,
  email: string,
  rol: "ADMIN" | "MEDIO"
): Promise<{ usuarioId: string; password: string }> {
  const password = generarContrasena()
  const { data, error } = await servicio.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { rol },
  })
  if (error) throw new Error(`No se pudo crear ${email}: ${error.message}`)
  return { usuarioId: data.user.id, password }
}

/**
 * Rol, organización y activación como lo haría la gestión de usuarios: el
 * cliente de servicio actúa como el superadministrador (`x-amo-actor`) y la
 * activación pasa por `activar_perfil_srv` (el estado no se cambia con UPDATE).
 */
export async function activarPerfil(
  servicio: ClienteSupabase,
  usuarioId: string,
  perfil: { nombre: string; rol: "ADMIN" | "MEDIO"; medioId?: string }
): Promise<void> {
  await actualizarPerfil(servicio, usuarioId, {
    nombre: perfil.nombre,
    rol_id: await idDeRol(servicio, perfil.rol),
    medio_id: perfil.medioId ?? null,
    debe_cambiar_password: false,
    es_demo: true,
  })
  const { error } = await servicio.rpc("activar_perfil_srv", {
    p_usuario_id: usuarioId,
  })
  if (error)
    throw new Error(`No se pudo activar ${usuarioId}: ${error.message}`)
}

/** Ingreso con contraseña; espera y reintenta si Auth aplica su límite de ingresos. */
export async function ingresar(
  entorno: EntornoBootstrap,
  email: string,
  password: string
): Promise<ClienteSupabase> {
  for (let intento = 1; ; intento++) {
    const cliente = crearClientePublico(entorno)
    const { error } = await cliente.auth.signInWithPassword({ email, password })
    if (!error) return cliente
    const limitado = error instanceof AuthApiError && error.status === 429
    if (!limitado || intento >= REINTENTOS_LIMITE) {
      throw new Error(`No se pudo ingresar con ${email}: ${error.message}`)
    }
    process.stderr.write(
      `  · Auth limitó los ingresos; reintento en ${ESPERA_LIMITE_MS / 1000} s\n`
    )
    await esperar(ESPERA_LIMITE_MS)
  }
}

export async function actorDe(
  usuarioId: string,
  cliente: ClienteSupabase
): Promise<Actor> {
  const { data } = await cliente.auth.getSession()
  if (!data.session) throw new Error(`El usuario ${usuarioId} no tiene sesión.`)
  return {
    usuarioId,
    sesionId: sessionIdDeToken(data.session.access_token),
    cliente,
  }
}

/** Enrola y verifica un TOTP en la sesión del cliente: la deja en aal2. */
export async function elevarAal2(cliente: ClienteSupabase): Promise<void> {
  const { data, error } = await cliente.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "AMO carrera",
    issuer: "AMO",
  })
  if (error) throw new Error(`No se pudo enrolar el TOTP: ${error.message}`)
  const verificacion = await cliente.auth.mfa.challengeAndVerify({
    factorId: data.id,
    code: await codigoTotpEstable(data.totp.secret),
  })
  if (verificacion.error) {
    throw new Error(
      `No se pudo verificar el TOTP: ${verificacion.error.message}`
    )
  }
}

export async function borrarUsuario(
  servicio: ClienteSupabase,
  usuarioId: string
): Promise<void> {
  const { error } = await servicio.auth.admin.deleteUser(usuarioId)
  if (error && !(error instanceof AuthApiError && error.status === 404)) {
    throw new Error(
      `No se pudo borrar el usuario ${usuarioId}: ${error.message}`
    )
  }
}
