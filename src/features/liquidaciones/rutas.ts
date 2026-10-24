/** Rutas de las liquidaciones de Finanzas (contrato de la fase 5: ficha, pagos, Operación y `/ir`). */
import type { Route } from "next"

export const RUTA_LIQUIDACIONES = "/finanzas/liquidaciones" as Route

/**
 * Vistas de `/finanzas/liquidaciones?vista=`: medios con verificadas por liquidar (LIQ-001) y las
 * liquidaciones por estado.
 */
export const VISTAS_LIQUIDACIONES = [
  "pendientes",
  "borrador",
  "aprobadas",
  "pagadas",
  "anuladas",
] as const

export type VistaLiquidaciones = (typeof VISTAS_LIQUIDACIONES)[number]

export function rutaVistaLiquidaciones(vista: VistaLiquidaciones): Route {
  return `${RUTA_LIQUIDACIONES}?vista=${vista}` as Route
}

/** Ficha de una liquidación (montos, retenciones, documento soporte, pago). */
export function rutaLiquidacion(liquidacionId: string): Route {
  return `${RUTA_LIQUIDACIONES}/${encodeURIComponent(liquidacionId)}` as Route
}
