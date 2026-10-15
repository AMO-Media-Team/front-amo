/**
 * Fábricas de datos para las pruebas del motor de insights (no se usan en la
 * aplicación). Cada prueba parte de una entrada vacía y agrega solo lo que su
 * regla necesita.
 */
import type { FilaKpi } from "@/components/kpi/tipos"

import {
  CONFIG_INSIGHTS_POR_DEFECTO,
  type EntradaInsights,
  type FilaMezcla,
} from "./tipos"

export const AHORA = new Date("2026-09-30T17:00:00Z")

export const PERIODO = { desde: "2026-09-01", hasta: "2026-09-30" }

export function entradaVacia(
  parcial: Partial<EntradaInsights> = {}
): EntradaInsights {
  return {
    periodo: PERIODO,
    ahora: AHORA,
    kpis: [],
    config: CONFIG_INSIGHTS_POR_DEFECTO,
    ...parcial,
  }
}

export function filaKpi(
  kpi: string,
  valor: number | null,
  valorAnterior: number | null,
  extra: Partial<FilaKpi> = {}
): FilaKpi {
  return {
    kpi,
    valor,
    valor_anterior: valorAnterior,
    variacion:
      valor !== null && valorAnterior
        ? (valor - valorAnterior) / valorAnterior
        : null,
    n: 50,
    unidad: "COP",
    serie: null,
    ...extra,
  }
}

export function filaMezcla(
  plataforma: FilaMezcla["plataforma"],
  formatoClave: string,
  formatoNombre: string,
  cpmEfectivo: number | null,
  { asignaciones = 30, gmv = 30_000_000 }: Partial<FilaMezcla> = {}
): FilaMezcla {
  return {
    plataforma,
    formatoClave,
    formatoNombre,
    asignaciones,
    gmv,
    cpmEfectivo,
  }
}
