import "server-only"

import { cache } from "react"

import { crearClienteAdmin } from "@/lib/supabase/admin"

import { obtenerAdaptadorCorreo } from "./index"

export const CLAVE_CORREO_HABILITADO = "correo.habilitado"

/** `true` solo con el booleano `true` (o su texto); cualquier otra cosa es apagado. */
export function comoHabilitado(valor: unknown): boolean {
  return valor === true || valor === "true"
}

/**
 * ¿Los avisos ya salen por correo? Hace falta el interruptor
 * `correo.habilitado` encendido y un proveedor en este servidor
 * (`AMO_CORREO_PROVEEDOR`): sin proveedor el despachador no reclama nada y los
 * correos se quedan en la cola. La clave no es pública (solo la lee quien
 * tiene `configuracion.ver`), así que se consulta con el cliente de servicio:
 * es un booleano sin datos personales. Lo usa Cuenta → Preferencias para decir
 * si los correos ya salen. `null` si no se pudo leer (la interfaz lo trata
 * como apagado).
 *
 * Quien llama ya autorizó con el DAL (la página pide `cuenta.gestionar`).
 */
export const envioCorreoHabilitado = cache(
  async (): Promise<boolean | null> => {
    try {
      if (!obtenerAdaptadorCorreo()) return false
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

/**
 * Claves de las plantillas EMAIL activas: solo esas se encolan
 * (`private.notificar`). Cuenta → Preferencias las agrupa por categoría para
 * no ofrecer casillas que no cambian nada (p. ej. las colas del equipo, que
 * nacen con el correo apagado). Las plantillas solo las lee quien tiene
 * `configuracion.ver`; se consultan con el cliente de servicio porque es un
 * catálogo sin datos personales. `null` si no se pudo leer (la interfaz no
 * deshabilita nada).
 *
 * Quien llama ya autorizó con el DAL (la página pide `cuenta.gestionar`).
 */
export const clavesCorreoActivas = cache(async (): Promise<string[] | null> => {
  try {
    const admin = await crearClienteAdmin()
    const { data, error } = await admin
      .from("plantillas_notificacion")
      .select("clave")
      .eq("canal", "EMAIL")
      .eq("activa", true)
    if (error || !data) return null
    return data.map((plantilla) => plantilla.clave)
  } catch {
    return null
  }
})
