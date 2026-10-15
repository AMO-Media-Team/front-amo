import "server-only"

import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

import type { Database } from "@/types/database.types"

import {
  OPCIONES_COOKIE_SESION,
  SUPABASE_CLAVE_PUBLICABLE,
  SUPABASE_URL,
} from "./configuracion"
import { obtenerCabecerasContexto } from "./contexto"

/**
 * Cliente con el JWT del usuario (RLS aplica) para Server Components, Server
 * Actions y Route Handlers. Se crea uno por solicitud: `@supabase/ssr` solo
 * entrega las cabeceras anti-caché en la primera escritura de cookies de cada
 * cliente, y compartirlo mezclaría sesiones entre usuarios.
 */
export async function crearClienteServidor() {
  const [almacen, cabecerasContexto] = await Promise.all([
    cookies(),
    obtenerCabecerasContexto(),
  ])

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_CLAVE_PUBLICABLE, {
    cookieOptions: OPCIONES_COOKIE_SESION,
    cookies: {
      getAll() {
        return almacen.getAll()
      },
      // Las cabeceras anti-caché (2.º argumento) no aplican aquí: las
      // respuestas de acciones (POST) no se cachean y el proxy ya las fija
      // en las navegaciones que refrescan la sesión.
      setAll(porEscribir) {
        try {
          for (const { name, value, options } of porEscribir) {
            almacen.set(name, value, options)
          }
        } catch {
          // Llamado desde un Server Component, que no puede escribir cookies:
          // el proxy ya refrescó la sesión en esta misma solicitud.
        }
      },
    },
    global: { headers: cabecerasContexto },
  })
}

/**
 * Cliente con un JWT recién emitido (ingreso o enlace) en la misma acción que
 * lo obtuvo, antes de que las cookies nuevas lleguen al navegador. RLS aplica
 * igual que con `crearClienteServidor`.
 */
export async function crearClienteConToken(accessToken: string) {
  const cabecerasContexto = await obtenerCabecerasContexto()
  return createClient<Database>(SUPABASE_URL, SUPABASE_CLAVE_PUBLICABLE, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { ...cabecerasContexto, Authorization: `Bearer ${accessToken}` },
    },
  })
}
