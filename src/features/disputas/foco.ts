/**
 * Destino del foco tras cambiar el estado de una disputa (módulo puro, sin
 * React: lo importa también `EstadoDisputa`, que se pinta en el servidor).
 */

/** Id del aviso del estado (`EstadoDisputa`, uno por página, con `tabIndex={-1}`). */
export const ID_ESTADO_DISPUTA = "estado-disputa"

export function avisoEstadoDisputa(): HTMLElement | null {
  return document.getElementById(ID_ESTADO_DISPUTA)
}
