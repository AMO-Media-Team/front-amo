/**
 * Destino del foco tras registrar algo en la ficha de una factura (módulo
 * puro, sin React: lo importa también el aviso de estado, que se pinta en el
 * servidor). El botón que abrió el diálogo puede desaparecer (un pago que
 * salda la factura, un borrador que se expide): el foco va al aviso, que
 * anuncia el estado nuevo.
 */

/** Id del aviso del estado de la factura (uno por página, con `tabIndex={-1}`). */
export const ID_ESTADO_FACTURA = "estado-factura"

export function avisoEstadoFactura(): HTMLElement | null {
  return document.getElementById(ID_ESTADO_FACTURA)
}
