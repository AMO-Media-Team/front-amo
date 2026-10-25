/** Id del aviso del estado en la ficha de una solicitud (recibe el foco tras un cambio). */
export const ID_ESTADO_SOLICITUD = "estado-solicitud"

/** El aviso del estado de la ficha, si está en la página. */
export function avisoEstadoSolicitud(): HTMLElement | null {
  return document.getElementById(ID_ESTADO_SOLICITUD)
}
