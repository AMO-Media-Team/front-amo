import { createBrowserClient } from "@supabase/ssr"

import type { Database } from "@/types/database.types"

import {
  OPCIONES_COOKIE_SESION,
  SUPABASE_CLAVE_PUBLICABLE,
  SUPABASE_URL,
} from "./configuracion"

/**
 * Cliente del navegador (Realtime, Storage con URL firmadas, lecturas con
 * RLS). `createBrowserClient` es un singleton en el navegador: todas las
 * llamadas comparten la misma instancia y el mismo refresco de sesión.
 */
export function obtenerClienteNavegador() {
  return createBrowserClient<Database>(
    SUPABASE_URL,
    SUPABASE_CLAVE_PUBLICABLE,
    { cookieOptions: OPCIONES_COOKIE_SESION }
  )
}
