/**
 * Motor de insights (docs/kpis.md §5): funciones puras que convierten los
 * datos de analítica en una lista priorizada de hallazgos en español.
 * Orden: severidad (crítico > atención > positivo > info), luego magnitud.
 */
import { reglaAccesosInusuales } from "./reglas/accesos-inusuales"
import { reglaCumplimiento } from "./reglas/cumplimiento"
import { reglaMediosEnRiesgo } from "./reglas/medios-riesgo"
import { reglaMejorCpm } from "./reglas/cpm"
import { reglaMetricasAtipicas } from "./reglas/metricas-atipicas"
import { reglaVariacion } from "./reglas/variacion"
import type { EntradaInsights, Insight, Severidad } from "./tipos"

export const ORDEN_SEVERIDAD: Readonly<Record<Severidad, number>> = {
  critico: 0,
  atencion: 1,
  positivo: 2,
  info: 3,
}

/** Máximo que se muestra en Inicio; el resto queda en "Ver todos". */
export const MAXIMO_INICIO = 4

type Regla = (entrada: EntradaInsights) => Insight | Insight[] | null

const REGLAS: readonly Regla[] = [
  reglaVariacion,
  reglaCumplimiento,
  reglaMediosEnRiesgo,
  reglaMejorCpm,
  reglaMetricasAtipicas,
  reglaAccesosInusuales,
]

export function compararInsights(a: Insight, b: Insight): number {
  return (
    ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad] ||
    b.magnitud - a.magnitud ||
    a.id.localeCompare(b.id)
  )
}

export function generarInsights(entrada: EntradaInsights): Insight[] {
  return REGLAS.flatMap((regla) => regla(entrada) ?? []).sort(compararInsights)
}
