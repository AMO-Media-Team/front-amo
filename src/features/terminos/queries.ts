import "server-only"

import { cache } from "react"

import type { TipoTerminos } from "@/lib/auth/compuertas"
import { informarFallo } from "@/lib/auth/registro"
import { crearClienteServidor } from "@/lib/supabase/server"

/**
 * Tipos de documento de los que la persona ya aceptó alguna versión: así la
 * pantalla explica que se trata de una versión nueva. Solo cambia textos: si
 * la consulta falla, se registra y se sigue como si fuera la primera vez.
 */
export const tiposAceptadosAntes = cache(
  async (usuarioId: string): Promise<ReadonlySet<TipoTerminos>> => {
    const supabase = await crearClienteServidor()
    const { data, error } = await supabase
      .from("aceptaciones_terminos")
      .select("version:terminos_versiones ( tipo )")
      .eq("perfil_id", usuarioId)
    if (error) {
      informarFallo("leer aceptaciones de términos", error)
      return new Set()
    }
    return new Set(data.map((fila) => fila.version.tipo))
  }
)
