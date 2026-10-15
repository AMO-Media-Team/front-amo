import "server-only"

import { cache } from "react"

import { indicadoresAsignaciones, serieMensual } from "../calculos"
import type { EstadoAsignacion } from "../estados"
import type { ActividadAsignaciones, AsignacionResumen } from "../tipos"
import { clienteSolicitud, fallar, leerTodo } from "./comun"

/** Asignaciones que muestran las fichas antes de enlazar al listado completo. */
export const LIMITE_RECIENTES = 8

const SELECCION_RESUMEN = `
  id, estado, plataforma, franja_clave, monto_bruto, created_at, aceptada_at, fecha_limite_publicacion,
  oferta:ofertas ( titulo ), campana:campanas ( nombre ), medio:medios ( nombre ),
  anunciante:anunciantes ( nombre_comercial )
` as const

export interface FiltroResumen {
  medioId?: string
  anuncianteId?: string
  campanaId?: string
}

/** Las más recientes de un medio, anunciante o campaña (por fecha de creación). */
export async function asignacionesResumen(
  filtro: FiltroResumen,
  limite: number
): Promise<AsignacionResumen[]> {
  const supabase = await clienteSolicitud()
  let consulta = supabase.from("asignaciones").select(SELECCION_RESUMEN)
  if (filtro.medioId) consulta = consulta.eq("medio_id", filtro.medioId)
  if (filtro.anuncianteId) {
    consulta = consulta.eq("anunciante_id", filtro.anuncianteId)
  }
  if (filtro.campanaId) consulta = consulta.eq("campana_id", filtro.campanaId)
  const { data, error } = await consulta
    .order("created_at", { ascending: false })
    .order("id")
    .limit(limite)
  if (error) fallar("leer las asignaciones", error)
  return data.map((fila) => ({
    id: fila.id,
    estado: fila.estado,
    plataforma: fila.plataforma,
    franja: fila.franja_clave,
    montoBruto: fila.monto_bruto,
    creadaAt: fila.created_at,
    aceptadaAt: fila.aceptada_at,
    fechaLimite: fila.fecha_limite_publicacion,
    oferta: fila.oferta?.titulo ?? null,
    campana: fila.campana?.nombre ?? null,
    medio: fila.medio?.nombre ?? null,
    anunciante: fila.anunciante?.nombre_comercial ?? null,
  }))
}

export type DuenoActividad = "medio" | "anunciante" | "campana"

const COLUMNA_DUENO: Readonly<
  Record<DuenoActividad, "medio_id" | "anunciante_id" | "campana_id">
> = {
  medio: "medio_id",
  anunciante: "anunciante_id",
  campana: "campana_id",
}

type FilaActividadBd = {
  id: string
  estado: EstadoAsignacion
  estado_previo_disputa: EstadoAsignacion | null
  monto_bruto: number | null
  aceptada_at: string | null
  verificada_at: string | null
  montos: { monto_medio: number | null } | null
}

/**
 * Todas las asignaciones de un medio, anunciante o campaña resumidas:
 * indicadores, serie de 12 meses y las más recientes. `montos` solo llega a
 * quien puede leer `asignacion_montos` (internos); sin él, el consumo del
 * tope anual queda en cero y la interfaz no lo muestra.
 */
export const actividadAsignaciones = cache(
  async (dueno: DuenoActividad, id: string): Promise<ActividadAsignaciones> => {
    const supabase = await clienteSolicitud()
    const columna = COLUMNA_DUENO[dueno]
    const [filas, recientes] = await Promise.all([
      leerTodo("leer las asignaciones", (desde, hasta) =>
        supabase
          .from("asignaciones")
          .select(
            "id, estado, estado_previo_disputa, monto_bruto, aceptada_at, verificada_at, montos:asignacion_montos ( monto_medio )"
          )
          .eq(columna, id)
          .order("id")
          .range(desde, hasta)
          .overrideTypes<FilaActividadBd[], { merge: false }>()
      ),
      asignacionesResumen(
        dueno === "medio"
          ? { medioId: id }
          : dueno === "anunciante"
            ? { anuncianteId: id }
            : { campanaId: id },
        LIMITE_RECIENTES
      ),
    ])
    const paraIndicadores = filas.map((fila) => ({
      estado: fila.estado,
      estadoPrevioDisputa: fila.estado_previo_disputa,
      montoBruto: fila.monto_bruto,
      montoMedio: fila.montos?.monto_medio ?? null,
      aceptadaAt: fila.aceptada_at,
      verificadaAt: fila.verificada_at,
    }))
    return {
      indicadores: indicadoresAsignaciones(paraIndicadores),
      serie: serieMensual(paraIndicadores),
      recientes,
    }
  }
)
