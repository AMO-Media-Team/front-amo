/**
 * Rutas de las disputas (contrato de la fase 4: las usan la bandeja interna,
 * Mis campañas del medio, el seguimiento del anunciante y los destinos de `/ir`).
 */
import type { Route } from "next"

import { rutaAsignacionMedio } from "@/features/mis-campanas/rutas"

export const RUTA_DISPUTAS = "/operacion/disputas" as Route

/** Ficha interna de una disputa (equipo AMO). */
export function rutaDisputaInterna(disputaId: string): Route {
  return `${RUTA_DISPUTAS}/${encodeURIComponent(disputaId)}` as Route
}

/** Reclamo o disputa de una asignación, desde «Mis campañas» del medio. */
export function rutaDisputaMedio(asignacionId: string): Route {
  return `${rutaAsignacionMedio(asignacionId)}/disputa` as Route
}

/** Disputa de una asignación, desde el seguimiento de la campaña del anunciante. */
export function rutaDisputaAnunciante(
  campanaId: string,
  asignacionId: string
): Route {
  return `/campanas/${encodeURIComponent(campanaId)}/asignaciones/${encodeURIComponent(asignacionId)}/disputa` as Route
}
