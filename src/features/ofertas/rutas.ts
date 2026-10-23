/**
 * Rutas de la oferta (módulo puro). Son contrato con el resolvedor
 * `/ir/[entidad]/[id]` (`src/features/enlaces/destinos.ts`): el anunciante
 * abre la ficha dentro de su campaña y el equipo AMO, la ficha interna.
 */
import type { Route } from "next"

import type { PasoOferta } from "@/features/asistente-oferta/pasos"
import { rutaAsistente } from "@/features/asistente-oferta/rutas"

/** Ficha de la oferta para su anunciante. */
export function rutaOfertaAnunciante(
  campanaId: string,
  ofertaId: string
): Route {
  return `/campanas/${campanaId}/ofertas/${ofertaId}` as Route
}

/** Ficha completa de la oferta para el equipo AMO (moderación incluida). */
export function rutaOfertaInterna(ofertaId: string): Route {
  return `/operacion/ofertas/${ofertaId}` as Route
}

/** Pestaña «Ofertas» de la campaña del anunciante. */
export function rutaOfertasDeCampana(campanaId: string): Route {
  return `/campanas/${campanaId}?pestana=ofertas` as Route
}

/** El asistente de la oferta abierto en un paso (`?paso=`). */
export function rutaPasoAsistente(
  campanaId: string,
  ofertaId: string,
  paso: PasoOferta
): Route {
  return `${rutaAsistente(campanaId, ofertaId)}?paso=${paso}` as Route
}
