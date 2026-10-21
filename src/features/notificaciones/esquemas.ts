/**
 * Esquemas del módulo: fila de la BD (TEMPORAL hasta regenerar los tipos),
 * filtros de la bandeja en la URL (nuqs; mismos parsers en cliente y
 * servidor) y entradas de las acciones. Módulo puro.
 */
import { createLoader, parseAsStringLiteral } from "nuqs/server"
import { z } from "zod"

import { CLAVES_CATEGORIA } from "./presentacion"

/** TEMPORAL (M8): validación de las columnas que se leen de `notificaciones`. */
export const esquemaFila = z.object({
  id: z.number().int(),
  tipo: z.string(),
  titulo: z.string(),
  mensaje: z.string(),
  url: z.string().nullable(),
  prioridad: z.number().int(),
  leida: z.boolean(),
  created_at: z.string(),
})

export const ESTADOS_FILTRO = ["todas", "no_leidas", "leidas"] as const
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number]

export const parsersBandeja = {
  estado: parseAsStringLiteral(ESTADOS_FILTRO).withDefault("todas"),
  categoria: parseAsStringLiteral(CLAVES_CATEGORIA),
}

/** Servidor: `await cargarFiltros(searchParams)`. */
export const cargarFiltros = createLoader(parsersBandeja)

export const esquemaFiltros = z.object({
  estado: z.enum(ESTADOS_FILTRO),
  categoria: z.enum(CLAVES_CATEGORIA).nullable(),
})

export type FiltrosBandeja = z.infer<typeof esquemaFiltros>

export const TAMANO_PAGINA = 30
/** Tope por acción masiva (evita UPDATE con listas enormes desde el cliente). */
export const MAXIMO_POR_ACCION = 200

export const esquemaMarcar = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(MAXIMO_POR_ACCION),
  leida: z.boolean(),
})

export const esquemaPagina = z.object({
  filtros: esquemaFiltros,
  antesId: z.number().int().positive(),
})
