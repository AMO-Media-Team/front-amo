/**
 * Bandeja de disputas del equipo AMO (ADM-012), módulo puro: su estado en la
 * URL (búsqueda, filtros, orden y página, con los MISMOS parsers en el
 * servidor y en la tabla) y los grupos de estado que muestra el resumen.
 * Por defecto, las abiertas primero y, entre ellas, la más antigua arriba.
 */
import type { Route } from "next"

import {
  definirEstadoTabla,
  type EstadoTabla,
  filtroDeOpciones,
} from "@/components/data-table/estado-url"
import { Constants } from "@/types/database.types"

import { RUTA_DISPUTAS } from "./rutas"
import type { EstadoDisputa } from "./tipos"

/** Grupos del filtro de estado: abiertas (sin tomar), en revisión y cerradas. */
export const GRUPOS_DISPUTA = ["abiertas", "en_revision", "cerradas"] as const

export type GrupoDisputa = (typeof GRUPOS_DISPUTA)[number]

export const ESTADOS_DE_GRUPO: Readonly<
  Record<GrupoDisputa, readonly EstadoDisputa[]>
> = {
  abiertas: ["ABIERTA"],
  en_revision: ["EN_REVISION"],
  cerradas: ["RESUELTA", "DESCARTADA"],
}

export const GRUPOS: Readonly<
  Record<GrupoDisputa, { etiqueta: string; descripcion: string }>
> = {
  abiertas: {
    etiqueta: "Abiertas",
    descripcion: "Nadie del equipo las ha tomado todavía.",
  },
  en_revision: {
    etiqueta: "En revisión",
    descripcion: "Alguien del equipo las está revisando.",
  },
  cerradas: {
    etiqueta: "Cerradas",
    descripcion: "Resueltas o descartadas.",
  },
}

/** Estados de la BD que corresponden a los grupos elegidos (vacío: todos). */
export function estadosDeGrupos(
  grupos: readonly GrupoDisputa[]
): EstadoDisputa[] {
  return GRUPOS_DISPUTA.filter((grupo) => grupos.includes(grupo)).flatMap(
    (grupo) => [...ESTADOS_DE_GRUPO[grupo]]
  )
}

/**
 * Campos de orden: `estado` (abiertas, en revisión y cerradas, en ese orden;
 * dentro de cada uno, la abierta hace más tiempo primero), `abierta` y
 * `resuelta` (fecha de apertura o de cierre).
 */
export const CAMPOS_ORDEN_DISPUTAS = ["estado", "abierta", "resuelta"] as const

export type CampoOrdenDisputas = (typeof CAMPOS_ORDEN_DISPUTAS)[number]

export const estadoTablaDisputas = definirEstadoTabla({
  camposOrden: CAMPOS_ORDEN_DISPUTAS,
  ordenPorDefecto: { campo: "estado", descendente: false },
  filtros: {
    estado: filtroDeOpciones(GRUPOS_DISPUTA),
    motivo: filtroDeOpciones(Constants.public.Enums.disputa_motivo),
    parte: filtroDeOpciones(Constants.public.Enums.disputa_parte),
  },
})

export type EstadoTablaDisputas = EstadoTabla<typeof estadoTablaDisputas>

/** Bandeja acotada a unos grupos de estado (enlaces desde otros módulos). */
export function rutaBandeja(grupos: readonly GrupoDisputa[] = []): Route {
  return estadoTablaDisputas.serializar(RUTA_DISPUTAS, {
    estado: grupos.length > 0 ? [...grupos] : null,
  }) as Route
}
