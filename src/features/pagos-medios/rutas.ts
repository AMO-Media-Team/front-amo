/** Rutas de los pagos a medios (contrato de la fase 5: dispersión y registro del pago, LIQ-005 y LIQ-006). */
import type { Route } from "next"

export const RUTA_PAGOS_MEDIOS = "/finanzas/pagos" as Route

/** `?vista=por-pagar` (aprobadas listas para el archivo del banco) o `?vista=dispersiones` (historial). */
export const VISTAS_PAGOS_MEDIOS = ["por-pagar", "dispersiones"] as const

export type VistaPagosMedios = (typeof VISTAS_PAGOS_MEDIOS)[number]

export function rutaVistaPagosMedios(vista: VistaPagosMedios): Route {
  return `${RUTA_PAGOS_MEDIOS}?vista=${vista}` as Route
}

/** Ficha de un archivo de pagos (dispersión): sus liquidaciones y la descarga. */
export function rutaDispersion(dispersionId: string): Route {
  return `${RUTA_PAGOS_MEDIOS}/${encodeURIComponent(dispersionId)}` as Route
}
