/**
 * Destino del foco tras cambiar el estado de la oferta (módulo puro, sin
 * React: lo importa también el aviso del estado, que se pinta en el
 * servidor). El hook que lo usa es `useFocoTrasCambio`.
 */

/** Id del aviso del estado (`AvisoEstadoOferta`, uno por ficha, con `tabIndex={-1}`). */
export const ID_AVISO_ESTADO_OFERTA = "aviso-estado-oferta"

export function avisoEstadoOferta(): HTMLElement | null {
  return document.getElementById(ID_AVISO_ESTADO_OFERTA)
}
