/** Rutas de la facturación al anunciante y la cartera de Finanzas (contrato de la fase 5, LIQ-008). */
import type { Route } from "next"

export const RUTA_FACTURAS = "/finanzas/facturas" as Route
export const RUTA_CARTERA = "/finanzas/cartera" as Route

/** Ficha de una factura (borrador, expedida, pagos y notas crédito). */
export function rutaFactura(facturaId: string): Route {
  return `${RUTA_FACTURAS}/${encodeURIComponent(facturaId)}` as Route
}
