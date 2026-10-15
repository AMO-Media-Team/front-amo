/**
 * Abortos esperables de la View Transition API. El navegador rechaza las
 * promesas de una transición cuando la descarta: la ventana cambió de tamaño
 * (en el teléfono, al ocultarse la barra de direcciones o girar la pantalla),
 * la pestaña quedó oculta u otra transición la interrumpió. El DOM ya quedó
 * actualizado; solo se perdió la animación, así que no es un error. Módulo puro.
 */

/** `DOMException.name` con que el navegador descarta una transición. */
const NOMBRES_DE_ABORTO: ReadonlySet<string> = new Set([
  "AbortError",
  "InvalidStateError",
])

/**
 * Los mismos nombres los usan otras API (un `fetch` cancelado también es
 * `AbortError`): solo cuentan los que hablan de una transición («Transition
 * was aborted…», «Skipping view transition because viewport size changed»).
 */
const MENCIONA_TRANSICION = /transition/i

export function esAbortoDeTransicion(razon: unknown): boolean {
  if (typeof razon !== "object" || razon === null) return false
  const { name, message } = razon as { name?: unknown; message?: unknown }
  return (
    typeof name === "string" &&
    NOMBRES_DE_ABORTO.has(name) &&
    typeof message === "string" &&
    MENCIONA_TRANSICION.test(message)
  )
}

/**
 * Manejador para `transicion.ready.catch(…)` y `transicion.finished`: deja
 * pasar el aborto esperable y vuelve a lanzar cualquier otro error (un fallo
 * al actualizar el DOM debe seguir viéndose).
 */
export function ignorarAbortoDeTransicion(razon: unknown): void {
  if (!esAbortoDeTransicion(razon)) throw razon
}
