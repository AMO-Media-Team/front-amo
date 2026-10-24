/**
 * Destinos del foco en la ficha de una liquidación (módulo puro, sin React:
 * lo importan componentes de servidor y de cliente).
 */

/** Aviso del estado (`AvisoEstadoFicha`, uno por página, con `tabIndex={-1}`). */
export const ID_ESTADO_LIQUIDACION = "estado-liquidacion"

/** Sección del documento soporte (destino de «registra la nota de ajuste»). */
export const ID_DOCUMENTO_SOPORTE = "documento-soporte"

export function avisoEstadoLiquidacion(): HTMLElement | null {
  return document.getElementById(ID_ESTADO_LIQUIDACION)
}

/** La sección del documento soporte (con `tabIndex={-1}`): enfocarla la trae a la vista. */
export function seccionDocumentoSoporte(): HTMLElement | null {
  return document.getElementById(ID_DOCUMENTO_SOPORTE)
}
