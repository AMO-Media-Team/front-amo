import "server-only"

import { cache } from "react"

import type { FilaKpi } from "@/components/kpi/tipos"
import { numero } from "@/features/dashboard/insights/adaptadores"
import { PLAZO_CARGA_HORAS_POR_DEFECTO } from "@/features/mis-campanas/siguiente-accion"

import { filasKpi } from "../kpi"
import { clientePanel, fallar } from "../servidor"
import {
  type AccionPendiente,
  ESTADOS_EN_CURSO,
  type GranularidadGanancias,
  type NegocioEnCurso,
  type PuntoGanancias,
  UMBRALES_TOPE_POR_DEFECTO,
} from "./datos"

/**
 * Consultas del panel del medio. El medio no lee `asignaciones` ni
 * `asignacion_montos` en la tabla base (§3.6): sus RPC son definer y filtran
 * por `mi_medio_id()`. Su ficha, los niveles y la configuración pública sí se
 * leen por RLS.
 */

const n = (valor: number | string | null | undefined) => numero(valor) ?? 0

export const kpisMedio = cache(
  async (
    desde: string,
    hasta: string,
    desdeAnterior: string,
    hastaAnterior: string
  ): Promise<FilaKpi[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("kpis_medio", {
      p_desde: desde,
      p_hasta: hasta,
      p_desde_ant: desdeAnterior,
      p_hasta_ant: hastaAnterior,
    })
    if (error) fallar("consultar tus ganancias", error)
    return filasKpi(data)
  }
)

export const serieGananciasMedio = cache(
  async (
    desde: string,
    hasta: string,
    granularidad: GranularidadGanancias
  ): Promise<PuntoGanancias[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("serie_ganancias_medio", {
      p_desde: desde,
      p_hasta: hasta,
      p_granularidad: granularidad,
    })
    if (error) fallar("consultar tu historial de ganancias", error)
    return data.map((fila) => ({
      periodo: fila.periodo,
      ganado: n(fila.ganado),
      pagado: n(fila.pagado),
      asignaciones: n(fila.asignaciones),
    }))
  }
)

export const proximasAcciones = cache(
  async (limite: number): Promise<AccionPendiente[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("proximas_acciones_medio", {
      p_limite: limite,
    })
    if (error) fallar("consultar tus próximas acciones", error)
    return data.map((fila) => ({
      asignacionId: fila.asignacion_id,
      ofertaTitulo: fila.oferta_titulo,
      accion: fila.accion,
      venceAt: fila.vence_at,
      numero: fila.numero ?? null,
      corte: fila.corte ?? null,
      metricaId: fila.metrica_id ?? null,
    }))
  }
)

/**
 * Asignaciones en curso, de la más reciente a la más antigua (`id` es un
 * UUID v7), con su oferta: `mis_asignaciones_medio` trae el título y la marca
 * (exige `asignaciones.ver_propias`; sin él no devuelve filas).
 */
export const asignacionesEnCurso = cache(
  async (limite: number): Promise<NegocioEnCurso[]> => {
    const supabase = await clientePanel()
    const { data, error } = await supabase.rpc("mis_asignaciones_medio", {
      p_estados: [...ESTADOS_EN_CURSO],
      p_limite: limite,
    })
    if (error) fallar("consultar tus negocios en curso", error)
    return data.map((fila) => ({
      id: fila.id,
      ofertaId: fila.oferta_id,
      estado: fila.estado,
      plataforma: fila.plataforma,
      montoMedio: numero(fila.monto_medio),
      titulo: fila.oferta_titulo?.trim() || null,
      marca: fila.marca?.trim() || null,
      handle: fila.handle ?? null,
      publicaciones: fila.publicaciones,
    }))
  }
)

/**
 * Horas para cargar un corte una vez cumplido (`metricas.plazo_carga_horas`,
 * pública): con ellas se sabe desde cuándo se habilita cada corte. Si no se
 * puede leer rige el valor sembrado, el mismo con el que la RPC calcula el
 * vencimiento.
 */
export const plazoCargaHoras = cache(async (): Promise<number> => {
  const supabase = await clientePanel()
  const { data } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "metricas.plazo_carga_horas")
    .maybeSingle()
  const valor = numero(
    typeof data?.valor === "number" || typeof data?.valor === "string"
      ? data.valor
      : null
  )
  return valor !== null && valor > 0 ? valor : PLAZO_CARGA_HORAS_POR_DEFECTO
})

/** Valor que siembra la migración (`medios.n_minimo_cumplimiento`). */
const N_MINIMO_CUMPLIMIENTO_POR_DEFECTO = 3

/**
 * Historial mínimo para mostrar la tasa de cumplimiento del medio. El medio
 * no lee `configuracion` (no es pública): sin permiso se usa el valor
 * sembrado, que es el mismo con el que la RPC decide si la tasa es `null`.
 */
export const nMinimoCumplimiento = cache(async (): Promise<number> => {
  const supabase = await clientePanel()
  const { data } = await supabase
    .from("configuracion")
    .select("valor")
    .eq("clave", "medios.n_minimo_cumplimiento")
    .maybeSingle()
  const valor = numero(
    typeof data?.valor === "number" || typeof data?.valor === "string"
      ? data.valor
      : null
  )
  return valor !== null && valor > 0 ? valor : N_MINIMO_CUMPLIMIENTO_POR_DEFECTO
})

/**
 * Lo que el panel toma de la ficha del medio: su nivel con los umbrales del
 * tope y la calificación. El tope y lo consumido llegan de `kpis_medio`, y el
 * cumplimiento también (con su n), no de las columnas que recalcula el cron.
 */
export interface FichaMedio {
  nivel: number
  nombreNivel: string | null
  porcentajeAlerta: number
  porcentajeBloqueo: number
  calificacion: number | null
}

/** Ficha propia y umbrales de su nivel (`null` si la cuenta no tiene medio visible). */
export const fichaMedio = cache(
  async (medioId: string): Promise<FichaMedio | null> => {
    const supabase = await clientePanel()
    const { data: medio, error } = await supabase
      .from("medios")
      .select("nivel_verificacion, calificacion_promedio")
      .eq("id", medioId)
      .maybeSingle()
    if (error) fallar("consultar la ficha de tu medio", error)
    if (!medio) return null

    const { data: nivel } = await supabase
      .from("niveles_verificacion")
      .select("nombre, porcentaje_alerta, porcentaje_bloqueo")
      .eq("nivel", medio.nivel_verificacion)
      .maybeSingle()
    return {
      nivel: medio.nivel_verificacion,
      nombreNivel: nivel?.nombre ?? null,
      porcentajeAlerta:
        numero(nivel?.porcentaje_alerta) ?? UMBRALES_TOPE_POR_DEFECTO.alerta,
      porcentajeBloqueo:
        numero(nivel?.porcentaje_bloqueo) ?? UMBRALES_TOPE_POR_DEFECTO.bloqueo,
      calificacion: numero(medio.calificacion_promedio),
    }
  }
)
