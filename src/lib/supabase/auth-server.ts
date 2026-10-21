import "server-only"

import { type CookieMethodsServer, createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import { getEnvServidor } from "@/lib/env.server"
import type { Database } from "@/types/database.types"

import {
  OPCIONES_COOKIE_SESION,
  SUPABASE_CLAVE_PUBLICABLE,
  SUPABASE_URL,
} from "./configuracion"
import { obtenerContextoSolicitud } from "./contexto"

/**
 * Solo la API de sesión del usuario. `admin` se excluye del tipo: con la
 * secret key funcionaría, y para eso existe `admin.ts` (con autorización previa).
 */
export type AuthServidor = Omit<SupabaseClient<Database>["auth"], "admin">

export interface OpcionesAuthServidor {
  /** Adaptador de cookies propio (proxy). Por defecto, `cookies()` de Next. */
  cookies?: CookieMethodsServer
  /** IP real del usuario. Por defecto, la de la solicitud en curso. */
  ip?: string | null
}

function cookiesDeNext(
  almacen: Awaited<ReturnType<typeof cookies>>
): CookieMethodsServer {
  return {
    getAll: () => almacen.getAll(),
    setAll(porEscribir) {
      try {
        for (const { name, value, options } of porEscribir) {
          almacen.set(name, value, options)
        }
      } catch {
        // Server Component: no puede escribir cookies (lo hace el proxy).
      }
    },
  }
}

/**
 * Auth de Supabase para ingreso, verificación de enlaces, MFA, intercambio de
 * códigos PKCE y refresco en el proxy. Con la secret key, Supabase acepta
 * `sb-forwarded-for` y aplica sus límites por IP del usuario (no por la IP
 * compartida del servidor). Sin ella (previews) usa la clave publicable.
 *
 * Devuelve solo `.auth`: la secret key nunca debe llegar a consultas de
 * datos por esta vía.
 */
export async function obtenerAuthServidor(
  opciones: OpcionesAuthServidor = {}
): Promise<AuthServidor> {
  const metodosCookies = opciones.cookies ?? cookiesDeNext(await cookies())
  const ip =
    opciones.ip !== undefined
      ? opciones.ip
      : (await obtenerContextoSolicitud()).ip
  const { SUPABASE_SECRET_KEY } = getEnvServidor()
  // Supabase solo acepta la IP reenviada en llamadas con secret key.
  const reenvioIp =
    SUPABASE_SECRET_KEY && ip ? { "sb-forwarded-for": ip } : null

  const cliente = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY ?? SUPABASE_CLAVE_PUBLICABLE,
    {
      cookieOptions: OPCIONES_COOKIE_SESION,
      cookies: metodosCookies,
      ...(reenvioIp ? { global: { headers: reenvioIp } } : {}),
    }
  )
  return cliente.auth
}
