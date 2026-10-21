import "server-only"

import type { CookieMethodsServer } from "@supabase/ssr"

import { crearClienteAdminOpcional } from "@/lib/supabase/admin"
import { obtenerAuthServidor } from "@/lib/supabase/auth-server"
import { obtenerContextoSolicitud } from "@/lib/supabase/contexto"
import { argumentosRpc } from "@/lib/supabase/rpc"

/**
 * Utilidades de servidor de las acciones de «Mi cuenta» (no son acciones: no
 * llevan `"use server"`). Nunca registran contraseñas, códigos ni secretos.
 */

export const MENSAJE_INESPERADO =
  "No pudimos completar la operación. Intenta de nuevo en unos minutos."

/** Log de servidor sin datos personales: operación y código. */
export function informar(operacion: string, error: unknown): void {
  const codigo =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "desconocido"
  console.error(`[cuenta] ${operacion} falló (${codigo})`)
}

// ── Limitador de intentos (Postgres, docs/modelo-datos.md §5.5) ─────────────

/**
 * Clave propia de estos flujos (la BD guarda solo su SHA-256): comprobar la
 * contraseña actual y los códigos de un factor nuevo no comparten contador
 * con el ingreso, pero sí el umbral por IP.
 */
export type FlujoCuenta = "reautenticacion" | "mfa-cuenta"

export function claveLimitadorCuenta(
  flujo: FlujoCuenta,
  usuarioId: string
): string {
  return `${flujo}:${usuarioId.toLowerCase()}`
}

export interface Bloqueo {
  bloqueado: boolean
  reintentarEnS: number
}

/** `null` sin secret key (previews): solo aplican los límites de Supabase Auth. */
export async function consultarBloqueo(clave: string): Promise<Bloqueo | null> {
  const [admin, { ip }] = await Promise.all([
    crearClienteAdminOpcional(),
    obtenerContextoSolicitud(),
  ])
  if (!admin) return null
  const { data, error } = await admin.rpc(
    "login_bloqueado_srv",
    argumentosRpc<"login_bloqueado_srv">({ p_email: clave, p_ip: ip })
  )
  if (error) throw error
  const fila = data[0]
  return {
    bloqueado: fila?.bloqueado ?? false,
    reintentarEnS: fila?.reintentar_en_s ?? 0,
  }
}

export async function registrarIntento(
  clave: string,
  exitoso: boolean
): Promise<void> {
  const [admin, { ip }] = await Promise.all([
    crearClienteAdminOpcional(),
    obtenerContextoSolicitud(),
  ])
  if (!admin) return
  const { error } = await admin.rpc(
    "registrar_intento_login_srv",
    argumentosRpc<"registrar_intento_login_srv">({
      p_email: clave,
      p_ip: ip,
      p_exito: exitoso,
    })
  )
  if (error) informar("registrar_intento_login_srv", error)
}

export function mensajeBloqueo(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60))
  return `Hiciste demasiados intentos. Espera ${minutos === 1 ? "1 minuto" : `${minutos} minutos`} e inténtalo de nuevo.`
}

// ── Reautenticación ──────────────────────────────────────────────────────────

/** Cookies en memoria: la sesión de comprobación nunca llega al navegador. */
function almacenEfimero(): CookieMethodsServer {
  const cookies = new Map<string, string>()
  return {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll(porEscribir) {
      for (const { name, value } of porEscribir) {
        if (value) cookies.set(name, value)
        else cookies.delete(name)
      }
    },
  }
}

export type Reautenticacion = "correcta" | "incorrecta" | "limitada"

/**
 * ¿Es correcta la contraseña actual? Supabase no ofrece verificarla sin
 * iniciar sesión: se abre una sesión aparte (cookies en memoria, misma IP
 * reenviada para sus límites) y se revoca de inmediato. La sesión del
 * navegador no cambia. Otros fallos (red, 5xx) se lanzan.
 */
export async function comprobarContrasenaActual(
  email: string,
  contrasena: string
): Promise<Reautenticacion> {
  const auth = await obtenerAuthServidor({ cookies: almacenEfimero() })
  const { data, error } = await auth.signInWithPassword({
    email,
    password: contrasena,
  })
  if (error) {
    if (error.status === 429 || error.code === "over_request_rate_limit") {
      return "limitada"
    }
    if (error.status === 400) return "incorrecta"
    throw error
  }
  if (!data.session) return "incorrecta"
  const { error: errorCierre } = await auth.signOut({ scope: "local" })
  if (errorCierre) informar("signOut(reautenticacion)", errorCierre)
  return "correcta"
}
