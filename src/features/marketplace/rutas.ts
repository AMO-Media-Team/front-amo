/** Rutas del marketplace del medio (contrato de la fase 3). */
import type { Route } from "next"

export const RUTA_OFERTAS_MEDIO = "/ofertas" as Route

export function rutaFichaOfertaMedio(ofertaId: string): Route {
  return `/ofertas/${encodeURIComponent(ofertaId)}` as Route
}
