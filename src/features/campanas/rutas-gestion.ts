/**
 * Rutas de la gestión de campañas y ofertas según quién actúa (módulo puro,
 * cliente y servidor). El anunciante gestiona lo suyo en «Mis campañas»; el
 * equipo AMO, por cuenta de un anunciante (ADM-014), desde Operación. Los
 * componentes compartidos (formulario de campaña, asistente de oferta,
 * acciones de la ficha) reciben el `ModoGestion` —serializable, viaja del
 * servidor al cliente— y piden aquí sus enlaces en vez de escribirlos a mano.
 */
import type { Route } from "next"

import type { PasoOferta } from "@/features/asistente-oferta/pasos"
import {
  rutaAsistente,
  rutaContinuarAsistente,
} from "@/features/asistente-oferta/rutas"
import {
  rutaOfertaAnunciante,
  rutaOfertaInterna,
  rutaOfertasDeCampana,
  rutaPasoAsistente,
} from "@/features/ofertas/rutas"
import {
  RUTAS_OPERACION,
  rutaAnunciante,
  rutaCampana,
} from "@/features/operacion/rutas"

import {
  RUTA_MI_EMPRESA,
  RUTA_MIS_CAMPANAS,
  rutaEditarCampana,
  rutaMiCampana,
} from "./rutas"

/** El anunciante con lo suyo, o el equipo AMO por cuenta de un anunciante. */
export type ModoGestion =
  | { modo: "propio" }
  | { modo: "asistido"; anuncianteId: string; anunciante: string }

export const GESTION_PROPIA: ModoGestion = { modo: "propio" }

/**
 * Cómo se nombra la empresa cuando quien actúa no puede leer su nombre (la
 * RLS oculta `anunciantes` sin `anunciantes.ver`). Concuerda con las
 * plantillas: «por cuenta de la empresa», «verifique a la empresa», «la
 * empresa recibe un aviso». Ninguna plantilla la pone al inicio de una frase.
 */
export const EMPRESA_SIN_NOMBRE = "la empresa"

/** Gestión asistida por cuenta de un anunciante, con su nombre si se conoce. */
export function modoAsistido(
  anuncianteId: string,
  nombre: string | null | undefined
): Extract<ModoGestion, { modo: "asistido" }> {
  return {
    modo: "asistido",
    anuncianteId,
    anunciante: nombre?.trim() || EMPRESA_SIN_NOMBRE,
  }
}

/** El nombre es el de la empresa (no el genérico de `EMPRESA_SIN_NOMBRE`). */
export function nombreConocido(anunciante: string): boolean {
  return anunciante !== EMPRESA_SIN_NOMBRE
}

export function esAsistido(
  gestion: ModoGestion
): gestion is Extract<ModoGestion, { modo: "asistido" }> {
  return gestion.modo === "asistido"
}

export interface RutasGestion {
  /** Listado de campañas («Mis campañas» u Operación › Campañas). */
  listado: Route
  /** Ficha de la campaña. */
  campana(id: string): Route
  /** Ficha de la campaña con sus ofertas a la vista. */
  ofertasCampana(id: string): Route
  editarCampana(id: string): Route
  /** Ficha de la oferta. */
  oferta(campanaId: string, ofertaId: string): Route
  /** Asistente de oferta nueva o de edición (BORRADOR o DEVUELTA). */
  asistente(campanaId: string, ofertaId?: string): Route
  /** Asistente nuevo que continúa con los borradores que ya creó. */
  continuarAsistente(
    campanaId: string,
    ofertaIds: readonly string[],
    paso?: PasoOferta
  ): Route
  /** Asistente de edición abierto en un paso (`?paso=`). */
  pasoAsistente(campanaId: string, ofertaId: string, paso: PasoOferta): Route
  /** Dónde se ve la empresa: «Mi empresa» o la ficha del anunciante. */
  empresa: Route
}

// ── Rutas propias de la gestión asistida (Operación) ─────────────────────────

/** Alta asistida de una campaña; con `anuncianteId`, el anunciante ya elegido. */
export function rutaNuevaCampanaAsistida(anuncianteId?: string): Route {
  const base = `${RUTAS_OPERACION.campanas}/nueva`
  return (
    anuncianteId
      ? `${base}?anunciante=${encodeURIComponent(anuncianteId)}`
      : base
  ) as Route
}

export function rutaEditarCampanaAsistida(id: string): Route {
  return `${rutaCampana(encodeURIComponent(id))}/editar` as Route
}

function rutaNuevaOfertaAsistida(campanaId: string): Route {
  return `${rutaCampana(encodeURIComponent(campanaId))}/ofertas/nueva` as Route
}

export function rutaEditarOfertaAsistida(ofertaId: string): Route {
  return `${rutaOfertaInterna(encodeURIComponent(ofertaId))}/editar` as Route
}

/** `?ofertas=a,b&paso=…` del asistente (misma forma en los dos modos). */
function consultaAsistente(ruta: Route): string {
  const indice = ruta.indexOf("?")
  return indice === -1 ? "" : ruta.slice(indice)
}

const RUTAS_PROPIAS: RutasGestion = {
  listado: RUTA_MIS_CAMPANAS,
  campana: (id) => rutaMiCampana(id),
  ofertasCampana: rutaOfertasDeCampana,
  editarCampana: rutaEditarCampana,
  oferta: rutaOfertaAnunciante,
  asistente: rutaAsistente,
  continuarAsistente: rutaContinuarAsistente,
  pasoAsistente: rutaPasoAsistente,
  empresa: RUTA_MI_EMPRESA,
}

function rutasAsistidas(anuncianteId: string): RutasGestion {
  return {
    listado: RUTAS_OPERACION.campanas,
    campana: (id) => rutaCampana(encodeURIComponent(id)),
    // «Ofertas» es la primera pestaña de la ficha interna: no ocupa la URL.
    ofertasCampana: (id) => rutaCampana(encodeURIComponent(id)),
    editarCampana: rutaEditarCampanaAsistida,
    oferta: (_campanaId, ofertaId) =>
      rutaOfertaInterna(encodeURIComponent(ofertaId)),
    asistente: (campanaId, ofertaId) =>
      ofertaId
        ? rutaEditarOfertaAsistida(ofertaId)
        : rutaNuevaOfertaAsistida(campanaId),
    continuarAsistente: (campanaId, ofertaIds, paso) =>
      `${rutaNuevaOfertaAsistida(campanaId)}${consultaAsistente(
        rutaContinuarAsistente(campanaId, ofertaIds, paso)
      )}` as Route,
    pasoAsistente: (_campanaId, ofertaId, paso) =>
      `${rutaEditarOfertaAsistida(ofertaId)}?paso=${paso}` as Route,
    empresa: rutaAnunciante(encodeURIComponent(anuncianteId)),
  }
}

export function rutasGestion(gestion: ModoGestion): RutasGestion {
  return esAsistido(gestion)
    ? rutasAsistidas(gestion.anuncianteId)
    : RUTAS_PROPIAS
}
