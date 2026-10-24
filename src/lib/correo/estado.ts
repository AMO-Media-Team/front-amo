import "server-only"

import { cache } from "react"

import { crearClienteAdmin } from "@/lib/supabase/admin"

export const CLAVE_CORREO_HABILITADO = "correo.habilitado"

/** `true` solo con el booleano `true` (o su texto); cualquier otra cosa es apagado. */
export function comoHabilitado(valor: unknown): boolean {
  return valor === true || valor === "true"
}

/**
 * ¿El envío de avisos por correo está encendido (`correo.habilitado`)? La
 * clave no es pública (solo la lee quien tiene `configuracion.ver`), así que
 * se consulta con el cliente de servicio: es un booleano sin datos
 * personales. Lo usa Cuenta → Preferencias para decir si los correos ya
 * salen. `null` si no se pudo leer (la interfaz lo trata como apagado).
 *
 * Quien llama ya autorizó con el DAL (la página pide `cuenta.gestionar`).
 */
export const envioCorreoHabilitado = cache(
  async (): Promise<boolean | null> => {
    try {
      const admin = await crearClienteAdmin()
      const { data, error } = await admin
        .from("configuracion")
        .select("valor")
        .eq("clave", CLAVE_CORREO_HABILITADO)
        .maybeSingle()
      if (error) return null
      return comoHabilitado(data?.valor)
    } catch {
      return null
    }
  }
)
