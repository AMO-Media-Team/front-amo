/**
 * Orden de compuertas del DAL (docs/modelo-datos.md §2.6). Módulo puro: lo
 * usan el DAL (cada página y acción) y las acciones de acceso para decidir el
 * siguiente paso sin volver a consultar la base de datos.
 *
 * 1. Sesión válida (claims verificados) — la resuelve el DAL.
 * 2. Perfil ACTIVO con rol; si no, se cierra la sesión.
 * 3. Factor verificado y sesión aal1 → verificar MFA. Va antes del cambio de
 *    contraseña porque Supabase rechaza `updateUser({ password })` con
 *    `insufficient_aal` si la cuenta tiene un factor verificado.
 * 4. `debe_cambiar_password` → cambio de contraseña.
 * 5. El rol exige MFA y no hay factor → configurar MFA.
 * 6. Permiso de la página o acción — lo resuelve el DAL.
 */
import type { JwtPayload } from "@supabase/supabase-js"
import type { Route } from "next"

import { destinoTrasIngreso } from "./navegacion"
import type { NivelAutenticacion } from "./tipos"

export type PasoPendiente =
  "mfa-verificar" | "cambiar-contrasena" | "mfa-configurar"

export interface EstadoCuenta {
  /** Perfil en estado ACTIVO, con rol y sin borrar. */
  perfilActivo: boolean
  debeCambiarPassword: boolean
  rolRequiereMfa: boolean
  aal: NivelAutenticacion
  tieneFactorVerificado: boolean
}

export type DecisionCompuertas =
  | { tipo: "salir" }
  | { tipo: "pendiente"; paso: PasoPendiente }
  | { tipo: "listo" }

export function resolverCompuertas(estado: EstadoCuenta): DecisionCompuertas {
  if (!estado.perfilActivo) return { tipo: "salir" }
  if (estado.tieneFactorVerificado && estado.aal !== "aal2") {
    return { tipo: "pendiente", paso: "mfa-verificar" }
  }
  if (estado.debeCambiarPassword) {
    return { tipo: "pendiente", paso: "cambiar-contrasena" }
  }
  if (estado.rolRequiereMfa && !estado.tieneFactorVerificado) {
    return { tipo: "pendiente", paso: "mfa-configurar" }
  }
  return { tipo: "listo" }
}

export const RUTAS_PASO = {
  "mfa-verificar": "/mfa/verificar",
  "cambiar-contrasena": "/cambiar-contrasena",
  "mfa-configurar": "/mfa/configurar",
} as const satisfies Record<PasoPendiente, Route>

/**
 * Ruta del paso. Solo la verificación MFA conserva el destino (`?next=`): es
 * el único paso que se repite en cada ingreso, y el destino ya es seguro.
 */
export function rutaDePaso(paso: PasoPendiente, siguiente?: string): Route {
  const ruta = RUTAS_PASO[paso]
  if (paso !== "mfa-verificar" || !siguiente) return ruta
  return `${ruta}?${new URLSearchParams({ next: siguiente })}` as Route
}

// ── Claims del JWT ───────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface MetodoAutenticacion {
  metodo: string
  /** Segundos desde la época Unix. */
  instante: number
}

export interface ClaimsSesion {
  usuarioId: string
  sessionId: string
  email: string | null
  aal: NivelAutenticacion
  metodos: readonly MetodoAutenticacion[]
}

function metodos(amr: JwtPayload["amr"]): MetodoAutenticacion[] {
  if (!Array.isArray(amr)) return []
  return amr.flatMap((entrada) =>
    typeof entrada === "object" &&
    entrada !== null &&
    typeof entrada.method === "string" &&
    typeof entrada.timestamp === "number"
      ? [{ metodo: entrada.method, instante: entrada.timestamp }]
      : []
  )
}

/** DTO de los claims ya verificados; `null` si faltan los identificadores. */
export function leerClaims(claims: JwtPayload): ClaimsSesion | null {
  if (!UUID.test(claims.sub ?? "") || !UUID.test(claims.session_id ?? "")) {
    return null
  }
  return {
    usuarioId: claims.sub,
    sessionId: claims.session_id,
    email: typeof claims.email === "string" ? claims.email : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    metodos: metodos(claims.amr),
  }
}

/**
 * Métodos con los que un enlace de correo inicia sesión: `otp` al verificar el
 * `token_hash` (/auth/confirm) y el tipo del enlace en el intercambio PKCE
 * (/auth/callback). Una sesión así, reciente, puede fijar contraseña sin la anterior.
 */
const METODOS_ENLACE: readonly string[] = [
  "otp",
  "recovery",
  "invite",
  "magiclink",
]
export const VENTANA_ENLACE_SEGUNDOS = 30 * 60

export function esSesionDeEnlace(
  claims: Pick<ClaimsSesion, "metodos">,
  ahoraMs: number = Date.now()
): boolean {
  const desde = ahoraMs / 1000 - VENTANA_ENLACE_SEGUNDOS
  return claims.metodos.some(
    ({ metodo, instante }) =>
      METODOS_ENLACE.includes(metodo) && instante >= desde
  )
}

/** Pantalla pública donde una sesión de enlace fija la contraseña nueva. */
export const RUTA_RESTABLECER = "/restablecer" satisfies Route

/**
 * Destino con todas las compuertas al día. `destinoTrasIngreso` descarta las
 * rutas públicas; la excepción es volver a `/restablecer` cuando una
 * recuperación de contraseña tuvo que verificar antes el TOTP.
 */
export function destinoFinal(
  siguiente: string | undefined,
  claims: Pick<ClaimsSesion, "metodos">,
  ahoraMs: number = Date.now()
): Route {
  if (siguiente === RUTA_RESTABLECER && esSesionDeEnlace(claims, ahoraMs)) {
    return RUTA_RESTABLECER
  }
  return destinoTrasIngreso(siguiente)
}
