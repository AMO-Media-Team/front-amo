/** Rutas de la validación del equipo AMO (contrato de la fase 4). */
import type { Route } from "next"

export const RUTA_VALIDACION = "/operacion/validacion" as Route

/** Colas de `/operacion/validacion?cola=` (ADM-007, ADM-008, ADM-009). */
export const COLAS_VALIDACION = ["evidencias", "metricas", "verificar"] as const

export type ColaValidacion = (typeof COLAS_VALIDACION)[number]

export function rutaColaValidacion(cola: ColaValidacion): Route {
  return `${RUTA_VALIDACION}?cola=${cola}` as Route
}
