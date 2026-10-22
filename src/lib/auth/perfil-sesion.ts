import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database.types"

import { construirPerfilSesion, type PerfilSesion } from "./autorizacion"
import {
  aTerminoPendiente,
  exigeAceptarTerminos,
  type TerminoPendiente,
} from "./compuertas"
import type { TipoRol } from "./tipos"

/**
 * Perfil, rol y permisos en UNA consulta. Con el JWT del usuario la permiten
 * las excepciones de RLS de fila propia (§2.3), incluso antes de verificar MFA.
 */
const CONSULTA_PERFIL = `
  id, email, nombre, estado, debe_cambiar_password, anunciante_id, medio_id, deleted_at,
  rol:roles!perfiles_rol_id_fkey (
    id, clave, nombre, tipo, color, requiere_mfa,
    rol_permisos ( permiso_clave )
  )
` as const

export async function leerPerfilSesion(
  cliente: SupabaseClient<Database>,
  usuarioId: string
): Promise<PerfilSesion | null> {
  const { data, error } = await cliente
    .from("perfiles")
    .select(CONSULTA_PERFIL)
    .eq("id", usuarioId)
    .maybeSingle()
  if (error) {
    throw new Error(`No se pudo cargar el perfil de la sesión (${error.code}).`)
  }
  return data ? construirPerfilSesion(data) : null
}

/**
 * Versiones vigentes de términos y política de datos que el usuario de la
 * sesión aún no acepta (AUT-012), con el JWT del usuario. Un rol interno no
 * acepta términos: ni se consulta. Si un tipo de documento aún no tiene
 * versión publicada, no aparece (no bloquea). Un fallo se propaga, como el del
 * perfil: la compuerta no se salta en silencio.
 */
export async function leerTerminosPendientes(
  cliente: SupabaseClient<Database>,
  tipoRol: TipoRol
): Promise<TerminoPendiente[]> {
  if (!exigeAceptarTerminos(tipoRol)) return []
  const { data, error } = await cliente.rpc("terminos_pendientes")
  if (error) {
    throw new Error(`No se pudieron consultar los términos (${error.code}).`)
  }
  return data.map(aTerminoPendiente)
}
