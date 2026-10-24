/** Rutas de las facturas del anunciante (contrato de la fase 5: ANU-013, panel, campañas y `/ir`). */
import type { Route } from "next"

export const RUTA_FACTURAS_ANUNCIANTE = "/facturas" as Route

/** Detalle de una factura expedida (pagos, notas crédito, PDF). */
export function rutaFacturaAnunciante(facturaId: string): Route {
  return `${RUTA_FACTURAS_ANUNCIANTE}/${encodeURIComponent(facturaId)}` as Route
}

/** Listado filtrado por campaña (`?campana=`): las consolidadas cubren varias. */
export function rutaFacturasDeCampana(campanaId: string): Route {
  return `${RUTA_FACTURAS_ANUNCIANTE}?campana=${encodeURIComponent(campanaId)}` as Route
}
