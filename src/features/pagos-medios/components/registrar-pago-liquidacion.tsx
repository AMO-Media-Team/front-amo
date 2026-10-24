"use client"

/**
 * «Registrar pago» de una liquidación aprobada (LIQ-006; contrato de la fase 5). STUB del líder:
 * el paquete PG lo implementa (fecha, referencia y soporte cargado) sin cambiar las props. Lo
 * montan la lista de pagos y la ficha de la liquidación.
 */
export interface RegistrarPagoLiquidacionProps {
  liquidacionId: string
  medio: string
  montoNeto: number
  /** Fecha mínima del pago (día de generación de la liquidación, `AAAA-MM-DD`). */
  fechaMinima: string
  /** Documento soporte emitido o factura del medio registrada; si no, el botón explica qué falta. */
  documentoListo: boolean
  /** Lo que muestra el botón: completo en la ficha, compacto en una fila. */
  variante?: "completo" | "fila"
}

export function RegistrarPagoLiquidacion(
  _props: RegistrarPagoLiquidacionProps
) {
  return null
}
