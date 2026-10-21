/**
 * Interpretación de las respuestas de PostgREST sobre `notificaciones`,
 * común al servidor (bandeja) y al navegador (campana). Módulo puro.
 *
 * TEMPORAL (migración 8): mientras la tabla no exista, las consultas
 * responden «no disponible» en lugar de fallar.
 */
import { z } from "zod"

import { esquemaFila } from "./esquemas"
import { aNotificacion } from "./presentacion"
import type { ConteoNoLeidas, Notificacion } from "./tipos"

/** PostgREST / Postgres: la tabla aún no existe. */
const TABLA_INEXISTENTE = new Set(["PGRST205", "42P01"])

interface ErrorPostgrest {
  code?: string | null
}

export function esTablaInexistente(error: ErrorPostgrest): boolean {
  return TABLA_INEXISTENTE.has(error.code ?? "")
}

/**
 * Respuesta del conteo (`HEAD` con `count: "exact"`). Sin la tabla, PostgREST
 * responde al HEAD sin cuerpo: ni error con código ni conteo. Con la tabla,
 * el conteo exacto siempre es un número (0 incluido).
 */
export function conteoDesdeRespuesta(respuesta: {
  count: number | null
  error: ErrorPostgrest | null
}): ConteoNoLeidas {
  const { count, error } = respuesta
  if (error?.code && !esTablaInexistente(error)) {
    throw new Error(`No se pudieron contar las notificaciones (${error.code}).`)
  }
  if (error || count === null) return { disponible: false, total: 0 }
  return { disponible: true, total: count }
}

/** Filas → DTO (valida con zod; `null` si la tabla aún no existe). */
export function notificacionesDesdeRespuesta(respuesta: {
  data: unknown
  error: ErrorPostgrest | null
}): Notificacion[] | null {
  const { data, error } = respuesta
  if (error) {
    if (esTablaInexistente(error)) return null
    throw new Error(
      `No se pudieron leer las notificaciones (${error.code ?? "sin código"}).`
    )
  }
  return z.array(esquemaFila).parse(data).map(aNotificacion)
}
