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
import type {
  AsignacionSeguimiento,
  DisputaSeguimiento,
  PerfilMedio,
  SeguimientoCampana,
} from "./tipos"

/**
 * Consultas del seguimiento con el cliente de la SESIÓN. `seguimiento_campana`
 * es definer pero filtra a la empresa del usuario (o exige `asignaciones.ver`)
 * y devuelve solo lo público del medio y los cortes aprobados; una campaña
 * ajena no trae filas. Un error se lanza y lo recoge el límite de la pestaña
 * (salvo las disputas, que son de apoyo).
 */

/** Nombres desde el diccionario local (no viaja al navegador). */
const UBICACION: ResolverUbicacion = {
  municipio: nombreMunicipio,
  // En Bogotá no se repite el nombre del distrito.
  departamento: (codigo) => departamentoJuntoAMunicipio(codigo),
}

/** Ids por lectura de disputas (el filtro `in` viaja en la URL). */
const IDS_POR_LECTURA = 100

/**
 * La disputa más reciente de cada asignación que alguna vez estuvo en disputa
 * (`en_disputa_at`; la RLS deja a la empresa leer las de sus asignaciones).
 * Dato de apoyo: si la lectura falla, las tarjetas deciden por el estado.
 */
async function ultimasDisputas(
  asignaciones: readonly AsignacionSeguimiento[]
): Promise<ReadonlyMap<string, DisputaSeguimiento> | null> {
  const ids = asignaciones
    .filter((asignacion) => asignacion.enDisputaAt !== null)
    .map((asignacion) => asignacion.id)
  const ultimas = new Map<string, DisputaSeguimiento>()
  if (ids.length === 0) return ultimas
  const supabase = await clienteSolicitud()
  for (let inicio = 0; inicio < ids.length; inicio += IDS_POR_LECTURA) {
    const { data, error } = await supabase
      .from("disputas")
      .select("id, asignacion_id, estado, estado_asignacion_origen")
      .in("asignacion_id", ids.slice(inicio, inicio + IDS_POR_LECTURA))
      .order("created_at", { ascending: false })
    if (error) {
      console.error(
        `[seguimiento] disputas no disponibles (${error.code ?? "sin código"})`
      )
      return null
    }
    for (const fila of data) {
      if (ultimas.has(fila.asignacion_id)) continue
      ultimas.set(fila.asignacion_id, {
        id: fila.id,
        estado: fila.estado,
        estadoOrigen: fila.estado_asignacion_origen,
      })
    }
  }
  return ultimas
}

/**
 * Cada asignación aceptada de la campaña con su disputa más reciente (una
 * lectura por solicitud).
 */
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
    const asignaciones = filas.map((fila) =>
      asignacionDesdeFila(fila, UBICACION)
    )
    const disputas = await ultimasDisputas(asignaciones)
    return {
      campanaId,
      asignaciones: disputas
        ? asignaciones.map((asignacion) => ({
            ...asignacion,
            disputa: disputas.get(asignacion.id) ?? null,
          }))
        : asignaciones,
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
