/**
 * Enlaces de las acciones sugeridas. Conservan el periodo consultado
 * (`desde`/`hasta`) y el filtro del grupo.
 *
 * El explorador geográfico tiene su propio constructor
 * (`rutaExplorador`, features/geo/rutas.ts). Verificados con sus pantallas:
 * accesos (`motivo`,
 * `periodo=personalizado` + `desde`/`hasta`, features/accesos). Supuestos a
 * confirmar cuando existan: reportes (`cumplimiento-medios`,
 * `desempeno-campanas` con `departamento`/`plataforma`), medios
 * (`segmento=en_riesgo`) y asignaciones (`alerta=metricas`).
 */
import type { Route } from "next"

import type { MetricaGeo } from "@/features/geo/metricas"

import type { EntradaInsights, KpiVariacion } from "./tipos"

type Parametros = Record<string, string | null | undefined>

export function construirHref(
  ruta: `/${string}`,
  parametros: Parametros,
  periodo?: EntradaInsights["periodo"]
): Route {
  const busqueda = new URLSearchParams()
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor) busqueda.set(clave, valor)
  }
  if (periodo) {
    busqueda.set("desde", periodo.desde)
    busqueda.set("hasta", periodo.hasta)
  }
  const consulta = busqueda.toString()
  return (consulta ? `${ruta}?${consulta}` : ruta) as Route
}

export const RUTAS_INSIGHTS = {
  reporteCumplimiento: "/reportes/cumplimiento-medios",
  reporteDesempeno: "/reportes/desempeno-campanas",
  medios: "/operacion/medios",
  asignaciones: "/operacion/asignaciones",
  accesos: "/administracion/accesos",
} as const satisfies Record<string, `/${string}`>

/** Métrica del explorador geográfico equivalente a cada KPI de la regla 1. */
export const METRICA_MAPA: Readonly<Record<KpiVariacion, MetricaGeo>> = {
  gmv_verificado: "gmv",
  gmv_comprometido: "gmv",
  negocios_cerrados: "asignaciones",
  alcance_total: "alcance",
}
