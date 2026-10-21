/**
 * Periodo opcional de los listados de operación (módulo puro). Usa las mismas
 * claves que Auditoría (`?periodo=`, `?desde=&hasta=`), así los enlaces de los
 * insights con `desde`/`hasta` llegan filtrados; sin parámetros no hay filtro
 * de fechas ("Todo el historial"), a diferencia de Auditoría.
 */
import { createLoader } from "nuqs/server"

import {
  etiquetaRango,
  parsersPeriodo,
  rangoDeValores,
  type ValoresPeriodo,
  ventanaDe,
  type VentanaTiempo,
} from "@/features/auditoria/periodo"
import type { RangoFechas } from "@/lib/fechas"

export { parsersPeriodo, type ValoresPeriodo }

export const ETIQUETA_SIN_PERIODO = "Todo el historial"

/** ¿La URL pide un periodo? Un rango personalizado exige ambas fechas. */
export function hayPeriodo(valores: ValoresPeriodo): boolean {
  return (
    (valores.periodo !== null && valores.periodo !== "personalizado") ||
    (valores.desde !== null && valores.hasta !== null)
  )
}

/** Rango pedido, o `null` si la vista abarca todo el historial. */
export function rangoOpcional(
  valores: ValoresPeriodo,
  ahora: Date = new Date()
): RangoFechas | null {
  return hayPeriodo(valores) ? rangoDeValores(valores, ahora) : null
}

export function etiquetaPeriodo(rango: RangoFechas | null): string {
  return rango ? etiquetaRango(rango) : ETIQUETA_SIN_PERIODO
}

/** Instantes UTC `[desde, hastaExclusivo)` del rango, o `null` sin periodo. */
export function ventanaOpcional(
  rango: RangoFechas | null
): VentanaTiempo | null {
  return rango ? ventanaDe(rango) : null
}

const cargarValores = createLoader(parsersPeriodo)

/** Servidor: periodo de la URL (o `null`) con los mismos parsers del selector. */
export async function cargarPeriodoOpcional(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<RangoFechas | null> {
  return rangoOpcional(await cargarValores(searchParams))
}
