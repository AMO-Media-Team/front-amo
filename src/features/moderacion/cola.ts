/**
 * Cola de moderación de ofertas (ADM-005), módulo puro: cómo viaja la página
 * en la URL (`?pagina=`, mismos parsers en servidor y cliente) y su ruta. La
 * cola se atiende de la oferta enviada hace más tiempo a la más reciente.
 */
import type { Route } from "next"
import { createLoader, parseAsInteger } from "nuqs/server"

export const RUTA_MODERACION = "/operacion/moderacion" as Route

/** Ofertas por página de la cola. */
export const TAMANO_PAGINA_MODERACION = 20

export const parsersModeracion = {
  pagina: parseAsInteger.withDefault(1),
}

/** Servidor: `await cargarParametrosModeracion(searchParams)`. */
export const cargarParametrosModeracion = createLoader(parsersModeracion)

/** `/operacion/moderacion?pagina=…` sin la primera página en la URL. */
export function rutaModeracion(pagina = 1): Route {
  const numero = Math.trunc(pagina)
  return (
    numero > 1 ? `${RUTA_MODERACION}?pagina=${numero}` : RUTA_MODERACION
  ) as Route
}

/** Página dentro de [1, última] con `total` ofertas; con 0, la 1. */
export function paginaEfectiva(pagina: number, total: number): number {
  const ultima = Math.max(
    1,
    Math.ceil(Math.max(0, total) / TAMANO_PAGINA_MODERACION)
  )
  if (!Number.isFinite(pagina)) return 1
  return Math.min(ultima, Math.max(1, Math.trunc(pagina)))
}
