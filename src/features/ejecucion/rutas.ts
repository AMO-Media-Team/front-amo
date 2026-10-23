/**
 * Rutas propias de la ejecución (las comunes, `rutaEvidencia` y
 * `rutaMetricas`, viven en `features/mis-campanas/rutas.ts`).
 */
import type { Route } from "next"

import { rutaMetricas } from "@/features/mis-campanas/rutas"

/**
 * Un corte personalizado: nuevo (sin `metricaId`) o el que se corrige. Una
 * publicación puede tener varios, así que se identifican por id.
 */
export function rutaMetricaPersonalizada(
  asignacionId: string,
  numero: number,
  metricaId?: string | null
): Route {
  const base = rutaMetricas(asignacionId, numero, "PERSONALIZADO")
  return (
    metricaId ? `${base}&metrica=${encodeURIComponent(metricaId)}` : base
  ) as Route
}
