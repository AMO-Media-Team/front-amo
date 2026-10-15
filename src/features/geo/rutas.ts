/**
 * Enlaces al explorador geográfico (módulo puro). Único lugar que arma su
 * URL: paneles, reportes y mini-mapas llevan a la misma vista con la métrica
 * y el periodo de quien enlaza. Los parámetros son los de `estado-url.ts`.
 */
import type { Route } from "next"

import type { RangoSerializado } from "@/lib/fechas"

import type { MetricaGeo, NivelGeo } from "./metricas"
import { DEPARTAMENTOS_SIN_DESCENSO } from "./niveles"

export const RUTA_EXPLORADOR = "/analitica/mapa"

/** Días de calendario `YYYY-MM-DD` (Bogotá), como los entrega `serializarRango`. */
export type PeriodoEnlace = Pick<RangoSerializado, "desde" | "hasta">

export interface DestinoExplorador {
  /** Métrica con la que abre; sin ella, la que el explorador trae por defecto. */
  metrica?: MetricaGeo
  /** Nivel a mostrar cuando no se pide un departamento (p. ej. `internacional`). */
  nivel?: NivelGeo
  /**
   * Código DANE del departamento a abrir (sus municipios). Bogotá y San
   * Andrés no tienen nivel municipal: quedan en el mapa de Colombia.
   */
  departamento?: string | null
  /** Periodo de quien enlaza; sin él, el explorador usa el suyo por defecto. */
  periodo?: PeriodoEnlace | null
}

/** `/analitica/mapa?metrica=gmv&nivel=departamental&depto=05&desde=…&hasta=…` */
export function rutaExplorador({
  metrica,
  nivel,
  departamento,
  periodo,
}: DestinoExplorador = {}): Route {
  const parametros = new URLSearchParams()
  if (metrica) parametros.set("metrica", metrica)
  if (departamento && !DEPARTAMENTOS_SIN_DESCENSO.has(departamento)) {
    parametros.set("nivel", "departamental")
    parametros.set("depto", departamento)
  } else if (nivel && nivel !== "nacional" && nivel !== "departamental") {
    // Colombia es el nivel por defecto y el departamental exige un departamento.
    parametros.set("nivel", nivel)
  }
  if (periodo) {
    parametros.set("desde", periodo.desde)
    parametros.set("hasta", periodo.hasta)
  }
  const consulta = parametros.toString()
  return (
    consulta ? `${RUTA_EXPLORADOR}?${consulta}` : RUTA_EXPLORADOR
  ) as Route
}
