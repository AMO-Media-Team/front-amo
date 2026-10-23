/**
 * Rutas de «Mis campañas» del medio (contrato de la fase 3: las usan el inicio
 * del medio, el marketplace, la ejecución y los destinos de `/ir`).
 */
import type { Route } from "next"

import type { Database } from "@/types/database.types"

type Corte = Database["public"]["Enums"]["corte_metrica"]

export const RUTA_MIS_CAMPANAS = "/mis-campanas" as Route

export function rutaAsignacionMedio(asignacionId: string): Route {
  return `/mis-campanas/${encodeURIComponent(asignacionId)}` as Route
}

export function rutaContenido(asignacionId: string): Route {
  return `${rutaAsignacionMedio(asignacionId)}/contenido` as Route
}

export function rutaEvidencia(asignacionId: string, numero?: number): Route {
  const base = `${rutaAsignacionMedio(asignacionId)}/evidencia`
  return (numero ? `${base}?numero=${numero}` : base) as Route
}

export function rutaMetricas(
  asignacionId: string,
  numero: number,
  corte: Corte
): Route {
  return `${rutaAsignacionMedio(asignacionId)}/metricas?numero=${numero}&corte=${corte}` as Route
}
