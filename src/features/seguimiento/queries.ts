import "server-only"

import { cache } from "react"

import {
  clienteSolicitud,
  departamentoJuntoAMunicipio,
  fallar,
  leerTodo,
  nombreMunicipio,
} from "@/features/operacion/queries/comun"

import {
  asignacionDesdeFila,
  perfilDesdeFila,
  type ResolverUbicacion,
} from "./normalizar"
import type { PerfilMedio, SeguimientoCampana } from "./tipos"

/**
 * Consultas del seguimiento con el cliente de la SESIÓN. `seguimiento_campana`
 * es definer pero filtra a la empresa del usuario (o exige `asignaciones.ver`)
 * y devuelve solo lo público del medio y los cortes aprobados; una campaña
 * ajena no trae filas. Un error se lanza y lo recoge el límite de la pestaña.
 */

/** Nombres desde el diccionario local (no viaja al navegador). */
const UBICACION: ResolverUbicacion = {
  municipio: nombreMunicipio,
  // En Bogotá no se repite el nombre del distrito.
  departamento: (codigo) => departamentoJuntoAMunicipio(codigo),
}

/** Cada asignación aceptada de la campaña (una lectura por solicitud). */
export const seguimientoDeCampana = cache(
  async (campanaId: string): Promise<SeguimientoCampana> => {
    const supabase = await clienteSolicitud()
    // La función ya ordena por aceptación (y id): los tramos son estables.
    const filas = await leerTodo(
      "leer el seguimiento de la campaña",
      (desde, hasta) =>
        supabase
          .rpc("seguimiento_campana", { p_campana_id: campanaId })
          .range(desde, hasta)
    )
    return {
      campanaId,
      asignaciones: filas.map((fila) => asignacionDesdeFila(fila, UBICACION)),
      consultadoAt: new Date().toISOString(),
    }
  }
)

/**
 * Ficha pública de un medio (`medios_publico`): la BD solo la entrega a un
 * anunciante con negocios en pie con él. `null` si no es visible.
 */
export async function perfilPublicoMedio(
  medioId: string
): Promise<PerfilMedio | null> {
  const supabase = await clienteSolicitud()
  const { data, error } = await supabase.rpc("medios_publico", {
    p_ids: [medioId],
  })
  if (error) fallar("leer el perfil del medio", error)
  const fila = data.find((medio) => medio.id === medioId)
  return fila ? perfilDesdeFila(fila, UBICACION) : null
}
