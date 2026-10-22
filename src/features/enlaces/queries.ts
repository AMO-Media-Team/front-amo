import "server-only"

import { crearClienteServidor } from "@/lib/supabase/server"

import type { EntidadEnlace, Relacionados } from "./destinos"

/**
 * Ids relacionados de la fila con el cliente de la persona (JWT + RLS): si no
 * puede ver la fila, no hay relacionados y el enlace no se resuelve.
 */
export async function relacionadosDe(
  entidad: EntidadEnlace,
  id: string
): Promise<Relacionados | null> {
  const supabase = await crearClienteServidor()
  switch (entidad) {
    case "documentos_medio":
    case "cuentas_sociales":
    case "verificaciones_cuenta":
    case "liquidaciones": {
      const { data } = await supabase
        .from(entidad)
        .select("medio_id")
        .eq("id", id)
        .maybeSingle()
      return data ? { medioId: data.medio_id } : null
    }
    case "documentos_anunciante":
    case "facturas": {
      const { data } = await supabase
        .from(entidad)
        .select("anunciante_id")
        .eq("id", id)
        .maybeSingle()
      return data ? { anuncianteId: data.anunciante_id } : null
    }
    case "ofertas": {
      const { data } = await supabase
        .from("ofertas")
        .select("campana_id")
        .eq("id", id)
        .maybeSingle()
      return data ? { campanaId: data.campana_id } : null
    }
    case "publicaciones":
    case "disputas": {
      const { data } = await supabase
        .from(entidad)
        .select("asignacion_id")
        .eq("id", id)
        .maybeSingle()
      return data ? { asignacionId: data.asignacion_id } : null
    }
    case "metricas": {
      const { data } = await supabase
        .from("metricas")
        .select("publicacion:publicaciones!inner(asignacion_id)")
        .eq("id", id)
        .maybeSingle()
      return data ? { asignacionId: data.publicacion.asignacion_id } : null
    }
    default:
      return {}
  }
}
