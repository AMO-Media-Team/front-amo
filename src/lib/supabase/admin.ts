import "server-only"

import { createClient } from "@supabase/supabase-js"

import { getEnvServidor } from "@/lib/env.server"
import type { Database } from "@/types/database.types"

import { SUPABASE_URL } from "./configuracion"
import { obtenerCabecerasContexto } from "./contexto"

export class ErrorClienteAdmin extends Error {
  constructor() {
    super(
      "Falta SUPABASE_SECRET_KEY: las funciones de administración están deshabilitadas en este entorno."
    )
    this.name = "ErrorClienteAdmin"
  }
}

export interface OpcionesClienteAdmin {
  /** Usuario que origina la acción (`x-amo-actor`), para auditar al actor real. */
  actorId?: string | null
}

/**
 * Cliente con la secret key (rol `service_role`, sin RLS). Solo para Server
 * Actions y Route Handlers DESPUÉS de autorizar con el DAL. Lleva las
 * cabeceras de contexto confiable para que la bitácora registre actor, IP y
 * navegador reales.
 */
export async function crearClienteAdmin({
  actorId,
}: OpcionesClienteAdmin = {}) {
  const { SUPABASE_SECRET_KEY } = getEnvServidor()
  if (!SUPABASE_SECRET_KEY) throw new ErrorClienteAdmin()

  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: await obtenerCabecerasContexto(actorId) },
  })
}

/**
 * Como `crearClienteAdmin`, pero `null` si el entorno no tiene secret key
 * (previews): para funciones que pueden degradarse sin ella.
 */
export async function crearClienteAdminOpcional(
  opciones: OpcionesClienteAdmin = {}
) {
  return getEnvServidor().SUPABASE_SECRET_KEY
    ? crearClienteAdmin(opciones)
    : null
}
