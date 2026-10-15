/**
 * Parámetros comunes a todos los clientes de Supabase. Las cookies de sesión
 * deben escribirse con las mismas opciones desde el proxy, el servidor y el
 * navegador; si no, el primero que refresca la sesión impondría las suyas.
 */
import type { CookieOptionsWithName } from "@supabase/ssr"

import { envCliente } from "@/lib/env"

export const SUPABASE_URL = envCliente.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_CLAVE_PUBLICABLE =
  envCliente.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/**
 * ~12 h: una jornada laboral. El JWT dura minutos y se refresca con el
 * refresh token de la cookie; la inactividad real la controla la BD
 * (`private.acceso_valido`), no la cookie.
 */
const DURACION_COOKIE_SESION_SEGUNDOS = 60 * 60 * 12

export const OPCIONES_COOKIE_SESION: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: DURACION_COOKIE_SESION_SEGUNDOS,
}
