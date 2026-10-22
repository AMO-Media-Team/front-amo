import "server-only"

import {
  type AuthError,
  isAuthApiError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js"
import type { Route } from "next"
import { headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"
import { cache } from "react"

import { crearClienteAdminOpcional } from "@/lib/supabase/admin"
import { crearClienteServidor } from "@/lib/supabase/server"

import { conNivel, esDeTipoRol, tieneAlgunPermiso } from "./autorizacion"
import {
  CABECERA_RUTA_SOLICITADA,
  type ClaimsSesion,
  destinoDeSolicitud,
  destinoFinal,
  esSesionDeEnlace,
  type EstadoCuenta,
  leerClaims,
  type PasoPendiente,
  resolverCompuertas,
  RUTA_RESTABLECER,
  rutaDePaso,
  type TerminoPendiente,
} from "./compuertas"
import { RUTA_INGRESO, RUTA_INICIO } from "./navegacion"
import { leerPerfilSesion, leerTerminosPendientes } from "./perfil-sesion"
import type { ClavePermiso } from "./permisos"
import { RegistroToques } from "./registro-toques"
import type { TipoRol, UsuarioSesion } from "./tipos"

/**
 * Data Access Layer de autenticación y autorización (docs/modelo-datos.md
 * §2.6). Cada `page.tsx` de `(app)` y cada Server Action lo invoca (un test lo
 * exige); el proxy solo redirige de forma optimista. `React.cache` evita
 * repetir consultas dentro de una misma solicitud.
 */

export { tieneAlgunPermiso } from "./autorizacion"

/** Cierra la sesión en el servidor (borra cookies) y lleva a `/ingresar?motivo=`. */
export const RUTA_SALIR = "/auth/salir" satisfies Route

export type MotivoSalida = "cuenta-inactiva" | "inactividad" | "sesion-expirada"

interface AccesoConUsuario {
  claims: ClaimsSesion
  usuario: UsuarioSesion
  cuenta: EstadoCuenta
  /**
   * Versiones vigentes de términos que el usuario externo aún no acepta
   * (AUT-012). La pantalla `/aceptar-terminos` las pinta y su acción las
   * inserta sin volver a consultarlas.
   */
  terminosPorAceptar: readonly TerminoPendiente[]
}

export type EstadoAcceso =
  | { tipo: "sin-sesion" }
  | { tipo: "salir"; claims: ClaimsSesion; motivo: MotivoSalida }
  | ({ tipo: "pendiente"; paso: PasoPendiente } & AccesoConUsuario)
  | ({ tipo: "listo" } & AccesoConUsuario)

type EstadoNoListo = Exclude<EstadoAcceso, { tipo: "listo" }>

// Un cliente por solicitud: getClaims() y las consultas comparten la sesión.
const clienteSolicitud = cache(crearClienteServidor)

/** Claims del JWT verificados (firma y expiración); `null` sin sesión. */
export const obtenerClaims = cache(async (): Promise<ClaimsSesion | null> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null
  return leerClaims(data.claims)
})

/** Auth ya no reconoce la sesión (cerrada, usuario borrado o bloqueado). */
function esSesionRechazada(error: AuthError): boolean {
  return (
    isAuthSessionMissingError(error) ||
    (isAuthApiError(error) && [401, 403, 404].includes(error.status))
  )
}

/**
 * ¿La cuenta tiene un TOTP verificado? Solo hace falta con sesión aal1 (en
 * aal2 ya se verificó uno). `getUser()` consulta Auth: la copia del usuario en
 * la cookie no es confiable. `null` si Auth ya no reconoce la sesión; otros
 * fallos (red, 5xx) se propagan en lugar de cerrar la sesión.
 */
const obtenerFactorVerificado = cache(async (): Promise<boolean | null> => {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    if (esSesionRechazada(error)) return null
    throw error
  }
  return (data.user.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified"
  )
})

async function evaluarAccesoSinCache(): Promise<EstadoAcceso> {
  const claims = await obtenerClaims()
  if (!claims) return { tipo: "sin-sesion" }

  const cliente = await clienteSolicitud()
  const perfil = await leerPerfilSesion(cliente, claims.usuarioId)
  if (!perfil?.activo) {
    return { tipo: "salir", claims, motivo: "cuenta-inactiva" }
  }

  // Independientes entre sí: el factor (Auth) y los términos (BD) a la vez.
  const [factor, terminosPorAceptar] = await Promise.all([
    claims.aal === "aal2" ? true : obtenerFactorVerificado(),
    leerTerminosPendientes(cliente, perfil.usuario.rol.tipo),
  ])
  if (factor === null) {
    return { tipo: "salir", claims, motivo: "sesion-expirada" }
  }

  const cuenta: EstadoCuenta = {
    perfilActivo: true,
    debeCambiarPassword: perfil.debeCambiarPassword,
    rolRequiereMfa: perfil.usuario.rol.requiereMfa,
    aal: claims.aal,
    tieneFactorVerificado: factor,
    terminosPendientes: terminosPorAceptar.length > 0,
  }
  const acceso = {
    claims,
    usuario: conNivel(perfil, claims.aal),
    cuenta,
    terminosPorAceptar,
  }
  const decision = resolverCompuertas(cuenta)
  switch (decision.tipo) {
    case "salir":
      return { tipo: "salir", claims, motivo: "cuenta-inactiva" }
    case "pendiente":
      return { tipo: "pendiente", paso: decision.paso, ...acceso }
    case "listo":
      return { tipo: "listo", ...acceso }
  }
}

/**
 * Compuertas 1–6 de §2.6 para la solicitud en curso: una sola evaluación (y
 * una sola consulta de términos) por solicitud.
 */
export const evaluarAcceso = cache(evaluarAccesoSinCache)

/**
 * A dónde iba la persona, si el proxy lo informó (`CABECERA_RUTA_SOLICITADA`):
 * el paso pendiente lo conserva y, al cumplirlo, la lleva allí.
 */
async function destinoSolicitado(): Promise<string | undefined> {
  return destinoDeSolicitud((await headers()).get(CABECERA_RUTA_SOLICITADA))
}

/**
 * `siguiente`: destino ya validado que conservan los pasos que lo admiten
 * (`rutaDePaso`); sin él, al cumplir el paso se llega a Inicio.
 */
function redirigirSegun(acceso: EstadoNoListo, siguiente?: string): never {
  switch (acceso.tipo) {
    case "sin-sesion":
      redirect(RUTA_INGRESO)
    case "salir":
      // Un Server Component no puede borrar cookies: lo hace el Route Handler.
      redirect(RUTA_SALIR)
    case "pendiente":
      redirect(rutaDePaso(acceso.paso, siguiente))
  }
}

// ── Vigencia de la sesión (inactividad y revocación) ─────────────────────────

/** Igual que `seguridad.sesion_actividad_throttle_segundos` (60 s por defecto). */
const INTERVALO_VERIFICACION_MS = 60_000
const toques = new RegistroToques(INTERVALO_VERIFICACION_MS)

export type VigenciaSesion = "VIGENTE" | "REVOCADA" | "INACTIVA"

function esVigencia(valor: unknown): valor is VigenciaSesion {
  return valor === "VIGENTE" || valor === "REVOCADA" || valor === "INACTIVA"
}

/**
 * Consulta `tocar_sesion_srv`, que registra la actividad solo si la sesión
 * sigue vigente (no reactiva una sesión revocada o vencida por inactividad).
 */
async function consultarVigencia(
  claims: ClaimsSesion
): Promise<VigenciaSesion> {
  const admin = await crearClienteAdminOpcional({ actorId: claims.usuarioId })
  // Previews sin secret key: la BD sigue aplicando la inactividad vía RLS.
  if (!admin) return "VIGENTE"
  const { data, error } = await admin.rpc("tocar_sesion_srv", {
    p_usuario_id: claims.usuarioId,
    p_session_id: claims.sessionId,
  })
  if (error) throw new Error(`No se pudo verificar la sesión (${error.code}).`)
  return esVigencia(data) ? data : "INACTIVA"
}

/** Como máximo una consulta por intervalo y sesión, salvo que se fuerce. */
export async function verificarVigencia(
  claims: ClaimsSesion,
  { forzar = false }: { forzar?: boolean } = {}
): Promise<VigenciaSesion> {
  const ahora = Date.now()
  if (!forzar && !toques.debeVerificar(claims.sessionId, ahora)) {
    return "VIGENTE"
  }
  const vigencia = await consultarVigencia(claims)
  if (vigencia === "VIGENTE") toques.registrar(claims.sessionId, ahora)
  else toques.olvidar(claims.sessionId)
  return vigencia
}

// ── API para páginas y Server Actions ────────────────────────────────────────

export interface OpcionesRequerirUsuario {
  /**
   * Devuelve también usuarios con un paso pendiente (MFA, cambio de
   * contraseña o términos). Solo para las pantallas y acciones de esos pasos.
   */
  permitirPendientes?: boolean
}

/** Usuario con sesión vigente que pasó todas las compuertas; si no, redirige. */
export async function requerirUsuario(
  opciones: OpcionesRequerirUsuario = {}
): Promise<UsuarioSesion> {
  const acceso = await evaluarAcceso()
  if (acceso.tipo === "pendiente" && opciones.permitirPendientes) {
    return acceso.usuario
  }
  if (acceso.tipo !== "listo") redirigirSegun(acceso, await destinoSolicitado())
  if ((await verificarVigencia(acceso.claims)) !== "VIGENTE") {
    redirect(RUTA_SALIR)
  }
  return acceso.usuario
}

function comoLista<T extends string>(valor: T | readonly T[]): readonly T[] {
  return typeof valor === "string" ? [valor] : valor
}

/** Exige al menos uno de los permisos; si no, responde 403 dentro del shell. */
export async function requerirPermiso(
  permisos: ClavePermiso | readonly ClavePermiso[]
): Promise<UsuarioSesion> {
  const usuario = await requerirUsuario()
  if (!tieneAlgunPermiso(usuario, comoLista(permisos))) forbidden()
  return usuario
}

/** Exige un tipo de rol (interno, anunciante o medio); si no, 403. */
export async function requerirTipoRol(
  tipos: TipoRol | readonly TipoRol[]
): Promise<UsuarioSesion> {
  const usuario = await requerirUsuario()
  if (!esDeTipoRol(usuario, comoLista(tipos))) forbidden()
  return usuario
}

/**
 * Para las pantallas y acciones de un paso pendiente (`/mfa/*`,
 * `/cambiar-contrasena`, `/aceptar-terminos`): devuelve el acceso si toca
 * alguno de esos pasos; si no, lleva al que toca o, con todo al día, al destino.
 */
export async function requerirPaso(
  pasos: PasoPendiente | readonly PasoPendiente[],
  { siguiente }: { siguiente?: string } = {}
): Promise<Extract<EstadoAcceso, { tipo: "pendiente" }>> {
  const acceso = await evaluarAcceso()
  if (acceso.tipo === "pendiente" && comoLista(pasos).includes(acceso.paso)) {
    return acceso
  }
  if (acceso.tipo === "listo") redirect(destinoFinal(siguiente, acceso.claims))
  // Otro paso pendiente: conserva el destino que este ya traía.
  redirigirSegun(acceso, destinoDeSolicitud(siguiente))
}

/**
 * Para `/restablecer`: sesión iniciada con un enlace de correo reciente. Si la
 * cuenta tiene TOTP, primero se verifica (Supabase exige aal2 para cambiar la
 * contraseña).
 */
export async function requerirSesionDeEnlace(): Promise<AccesoConUsuario> {
  const acceso = await evaluarAcceso()
  if (acceso.tipo === "sin-sesion") {
    redirect("/ingresar?motivo=enlace-invalido")
  }
  if (acceso.tipo === "salir") redirect(RUTA_SALIR)
  if (acceso.tipo === "pendiente" && acceso.paso === "mfa-verificar") {
    redirect(rutaDePaso("mfa-verificar", RUTA_RESTABLECER))
  }
  if (!esSesionDeEnlace(acceso.claims)) {
    redirect(acceso.tipo === "listo" ? RUTA_INICIO : rutaDePaso(acceso.paso))
  }
  return acceso
}

/** Para el layout de `(app)`: el usuario del shell (las páginas autorizan aparte). */
export async function obtenerUsuarioShell(): Promise<UsuarioSesion> {
  const acceso = await evaluarAcceso()
  if (acceso.tipo !== "listo") redirigirSegun(acceso, await destinoSolicitado())
  return acceso.usuario
}

// ── Salida forzada (Route Handler /auth/salir) ───────────────────────────────

export type DecisionSalida =
  | { tipo: "continuar"; destino: string }
  | {
      tipo: "salir"
      motivo: MotivoSalida
      claims: ClaimsSesion | null
      evento: "SESION_EXPIRADA" | "SESION_REVOCADA" | null
    }

/**
 * Vuelve a evaluar el acceso (sin caché ni intervalo) y decide si hay que
 * cerrar la sesión. El motivo sale del servidor, nunca de la URL: así la ruta
 * no sirve para cerrar la sesión de otra persona con un enlace.
 */
export async function decidirSalida(): Promise<DecisionSalida> {
  const acceso = await evaluarAccesoSinCache()
  switch (acceso.tipo) {
    case "sin-sesion":
      return {
        tipo: "salir",
        motivo: "sesion-expirada",
        claims: null,
        evento: null,
      }
    case "salir":
      return {
        tipo: "salir",
        motivo: acceso.motivo,
        claims: acceso.claims,
        evento: "SESION_REVOCADA",
      }
    case "pendiente":
      return { tipo: "continuar", destino: rutaDePaso(acceso.paso) }
    case "listo": {
      const vigencia = await verificarVigencia(acceso.claims, { forzar: true })
      if (vigencia === "VIGENTE") {
        return { tipo: "continuar", destino: RUTA_INICIO }
      }
      return vigencia === "INACTIVA"
        ? {
            tipo: "salir",
            motivo: "inactividad",
            claims: acceso.claims,
            evento: "SESION_EXPIRADA",
          }
        : {
            tipo: "salir",
            motivo: "sesion-expirada",
            claims: acceso.claims,
            evento: "SESION_REVOCADA",
          }
    }
  }
}
