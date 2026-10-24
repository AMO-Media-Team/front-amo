/** Rutas de Ganancias del medio (contrato de la fase 5: MED-015, inicio del medio, Mis campañas y `/ir`). */
import type { Route } from "next"

export const RUTA_GANANCIAS = "/ganancias" as Route

/** Detalle de una liquidación del medio (desglose, documento soporte, pago y su factura si factura). */
export function rutaLiquidacionMedio(liquidacionId: string): Route {
  return `${RUTA_GANANCIAS}/${encodeURIComponent(liquidacionId)}` as Route
}
