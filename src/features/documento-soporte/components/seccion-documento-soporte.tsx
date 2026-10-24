"use client"

/**
 * Sección «Documento soporte» de la ficha de la liquidación (contrato de la fase 5). STUB del
 * líder: el paquete DS la implementa (emitir o registrar el del proveedor, archivos, CUDS, nota de
 * ajuste y anulación) sin cambiar las props.
 */
import type { EstadoLiquidacion } from "@/features/operacion/estados"

import type {
  DocumentoSoporteFicha,
  NumeracionDocumentoSoporte,
} from "../tipos"

export interface SeccionDocumentoSoporteProps {
  liquidacionId: string
  estadoLiquidacion: EstadoLiquidacion
  documento: DocumentoSoporteFicha | null
  numeracion: NumeracionDocumentoSoporte
  /** `liquidaciones.aprobar`: emitir, registrar CUDS, nota de ajuste, anular. */
  puedeGestionar: boolean
}

export function SeccionDocumentoSoporte(_props: SeccionDocumentoSoporteProps) {
  return null
}
