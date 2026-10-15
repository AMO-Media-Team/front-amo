/**
 * Rutas de la operación (módulo puro): listados, fichas y enlaces a los
 * listados ya filtrados con los mismos parsers de la URL que usan las tablas.
 */
import type { Route } from "next"

import {
  ESTADOS_POR_GRUPO,
  type EstadoAsignacion,
  type GrupoAsignacion,
} from "./estados"
import { estadoTablaAsignaciones, estadoTablaCampanas } from "./estado-tablas"

export const RUTAS_OPERACION = {
  medios: "/operacion/medios",
  anunciantes: "/operacion/anunciantes",
  campanas: "/operacion/campanas",
  asignaciones: "/operacion/asignaciones",
} as const satisfies Record<string, Route>

export function rutaMedio(id: string): Route {
  return `${RUTAS_OPERACION.medios}/${id}` as Route
}

export function rutaAnunciante(id: string): Route {
  return `${RUTAS_OPERACION.anunciantes}/${id}` as Route
}

export function rutaCampana(id: string): Route {
  return `${RUTAS_OPERACION.campanas}/${id}` as Route
}

export function rutaAsignacion(id: string): Route {
  return `${RUTAS_OPERACION.asignaciones}/${id}` as Route
}

export type DuenoAsignaciones = "medio" | "anunciante" | "campana"

/**
 * Listado de asignaciones de un medio, anunciante o campaña; opcionalmente
 * acotado a un grupo de estados o a estados concretos.
 */
export function rutaAsignacionesDe(
  dueno: DuenoAsignaciones,
  id: string,
  filtro: {
    grupo?: GrupoAsignacion
    estados?: readonly EstadoAsignacion[]
  } = {}
): Route {
  const estados =
    filtro.estados ?? (filtro.grupo ? ESTADOS_POR_GRUPO[filtro.grupo] : [])
  return estadoTablaAsignaciones.serializar(RUTAS_OPERACION.asignaciones, {
    [dueno]: [id],
    estado: estados.length > 0 ? [...estados] : null,
  }) as Route
}

/** Listado de asignaciones acotado a un grupo de estados (sin otro filtro). */
export function rutaAsignacionesGrupo(grupo: GrupoAsignacion): Route {
  return estadoTablaAsignaciones.serializar(RUTAS_OPERACION.asignaciones, {
    estado: [...ESTADOS_POR_GRUPO[grupo]],
  }) as Route
}

/** Listado de campañas de un anunciante. */
export function rutaCampanasDe(anuncianteId: string): Route {
  return estadoTablaCampanas.serializar(RUTAS_OPERACION.campanas, {
    anunciante: [anuncianteId],
  }) as Route
}
