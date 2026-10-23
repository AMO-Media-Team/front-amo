/**
 * Destino del foco tras cambiar el estado de una asignación desde su ficha
 * (módulo puro, sin React: lo importan el aviso del estado, que se pinta en
 * el servidor, y las acciones de la cabecera).
 */

/** Id del aviso del estado (uno por ficha, con `tabIndex={-1}`). */
export const ID_AVISO_ESTADO_ASIGNACION = "aviso-estado-asignacion"

export function avisoEstadoAsignacion(): HTMLElement | null {
  return document.getElementById(ID_AVISO_ESTADO_ASIGNACION)
}
