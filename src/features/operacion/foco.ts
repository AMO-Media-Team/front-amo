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

function tituloFicha(): HTMLElement | null {
  const titulo = document.querySelector<HTMLElement>("main h1")
  if (titulo && !titulo.hasAttribute("tabindex")) titulo.tabIndex = -1
  return titulo
}

/**
 * Foco al cerrar un diálogo que cambió el estado (`finalFocus`). Base UI
 * enfocaría el primer control del aviso (su enlace); el aviso entero anuncia
 * el estado nuevo, así que el diálogo no mueve el foco (`false`) y se pone
 * aquí: en el aviso si ya está, o en el título de la ficha mientras el
 * refresco lo pinta (hasta 5 s), sin quitárselo a otro control que la persona
 * haya elegido entre tanto.
 */
export function avisoEstadoTrasCambio(): false {
  window.setTimeout(() => {
    const aviso = avisoEstadoAsignacion()
    if (aviso) {
      aviso.focus()
      return
    }
    const titulo = tituloFicha()
    titulo?.focus()
    const observador = new MutationObserver(() => {
      const nuevo = avisoEstadoAsignacion()
      if (!nuevo) return
      observador.disconnect()
      const activo = document.activeElement
      if (!activo || activo === document.body || activo === titulo)
        nuevo.focus()
    })
    observador.observe(document.body, { childList: true, subtree: true })
    window.setTimeout(() => observador.disconnect(), 5_000)
  }, 0)
  return false
}
