/**
 * Cambios de lectura aplicados de forma optimista (antes de que responda el
 * servidor) a la lista y al conteo en caché. Módulo puro.
 */
import type { ConteoNoLeidas, Notificacion } from "./tipos"

export type CambioLectura =
  { ids: readonly number[]; leida: boolean } | { todas: true }

function leidaTras(cambio: CambioLectura, notificacion: Notificacion): boolean {
  if ("todas" in cambio) return true
  return cambio.ids.includes(notificacion.id)
    ? cambio.leida
    : notificacion.leida
}

export function aplicarALista(
  notificaciones: readonly Notificacion[],
  cambio: CambioLectura
): Notificacion[] {
  return notificaciones.map((notificacion) => {
    const leida = leidaTras(cambio, notificacion)
    return leida === notificacion.leida
      ? notificacion
      : { ...notificacion, leida }
  })
}

/**
 * Conteo estimado tras el cambio. Si la lista en caché conoce el estado previo
 * de las afectadas, solo cuentan las que de verdad cambian; si no, se asume
 * que todas cambian (la revalidación posterior corrige cualquier diferencia).
 */
export function aplicarAConteo(
  conteo: ConteoNoLeidas,
  cambio: CambioLectura,
  conocidas: readonly Notificacion[] = []
): ConteoNoLeidas {
  if ("todas" in cambio) return { ...conteo, total: 0 }
  const previas = new Map(conocidas.map((n) => [n.id, n.leida]))
  const cambian = cambio.ids.filter((id) => previas.get(id) !== cambio.leida)
  const delta = cambio.leida ? -cambian.length : cambian.length
  return { ...conteo, total: Math.max(0, conteo.total + delta) }
}

/**
 * Estado de lectura que muestra la bandeja: la marca hecha en esta visita, si
 * la hay; si no, lo que dijo el servidor o «Marcar todas» (que solo alcanza a
 * las creadas hasta ese instante: las que lleguen después siguen sin leer).
 */
export function leidaEnBandeja(
  notificacion: Notificacion,
  marcas: ReadonlyMap<number, boolean>,
  todasLeidasHasta: number | null
): boolean {
  return (
    marcas.get(notificacion.id) ??
    (notificacion.leida ||
      (todasLeidasHasta !== null &&
        Date.parse(notificacion.creadaAt) <= todasLeidasHasta))
  )
}
