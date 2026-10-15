import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database.types"

import { construirPerfilSesion, type PerfilSesion } from "./autorizacion"

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
