/**
 * Periodo de un corte de liquidación (LIQ-001, D79), módulo puro. La BD
 * rechaza un periodo que no ha cerrado (el que termina hoy cuenta como
 * cerrado) y liquida las verificadas hasta su último día, incluidas las que
 * quedaron fuera de cortes anteriores. Todo «día» es de Bogotá.
 */
import { serializarFecha } from "@/lib/fechas"

import type { MedioCorte } from "./tipos"

export interface PeriodoCorte {
  /** `AAAA-MM-DD`. */
  inicio: string
  /** `AAAA-MM-DD`, ≤ hoy. */
  fin: string
}

/** `periodo_liquidacion_sugerido().periodicidad`. */
export type Periodicidad = "SEMANAL" | "QUINCENAL" | "MENSUAL"

export const ETIQUETAS_PERIODICIDAD: Readonly<Record<Periodicidad, string>> = {
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
}

export function esPeriodicidad(valor: unknown): valor is Periodicidad {
  return valor === "SEMANAL" || valor === "QUINCENAL" || valor === "MENSUAL"
}

/** Hoy en Bogotá (`AAAA-MM-DD`). */
export function hoyBogota(ahora: Date = new Date()): string {
  return serializarFecha(ahora)
}

/** El día de Bogotá de un instante (`verificada_at`). */
export function diaDeInstante(instante: string): string {
  return serializarFecha(new Date(instante))
}

export interface MediosDelCorte {
  /** Medios con al menos una verificada sin liquidar hasta el fin del periodo. */
  entran: number
  /**
   * De esos, los que ya tienen una liquidación que termina dentro o después
   * del inicio: la BD no deja cruzar periodos y quedarán por fuera.
   */
  conCruce: number
}

/**
 * Cuántos medios entran en el corte: los que tienen alguna verificada sin
 * liquidar hasta el fin del periodo (la primera verificada es del fin o
 * antes), como hace `generar_liquidaciones_corte_srv`.
 */
export function mediosDelCorte(
  medios: readonly MedioCorte[],
  periodo: PeriodoCorte
): MediosDelCorte {
  let entran = 0
  let conCruce = 0
  for (const medio of medios) {
    if (diaDeInstante(medio.primeraVerificada) > periodo.fin) continue
    entran += 1
    if (
      medio.ultimaLiquidacionFin !== null &&
      medio.ultimaLiquidacionFin >= periodo.inicio
    ) {
      conCruce += 1
    }
  }
  return { entran, conCruce }
}

export type ErroresPeriodo = Partial<Record<keyof PeriodoCorte, string>>

/** Los errores de un `safeParse` del periodo, por campo (el primero de cada uno). */
export function erroresDePeriodo(
  issues: readonly { path: readonly PropertyKey[]; message: string }[]
): ErroresPeriodo {
  const errores: ErroresPeriodo = {}
  for (const issue of issues) {
    const campo = issue.path[0]
    if (campo === "inicio" || campo === "fin") errores[campo] ??= issue.message
  }
  return errores
}

/** Los errores de campo que devolvió la acción (`erroresCampo`), en el mismo formato. */
export function erroresPeriodoDeAccion(
  erroresCampo: Record<string, string[]> | undefined
): ErroresPeriodo {
  return {
    ...(erroresCampo?.inicio?.[0] ? { inicio: erroresCampo.inicio[0] } : {}),
    ...(erroresCampo?.fin?.[0] ? { fin: erroresCampo.fin[0] } : {}),
  }
}
