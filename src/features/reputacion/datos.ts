/**
 * Presentación de la reputación del medio (MED-016, módulo puro): si hay tasa
 * de cumplimiento o «Sin historial suficiente», sus textos y por qué cada
 * negocio de la ventana cuenta como cumplido o no. Sin I/O ni React.
 *
 * La regla es la de `private.cumplimiento_aplica` y `private.cumplimiento_ok`
 * (docs/kpis.md §1.10), la misma del cron que publica la tasa a los
 * anunciantes: cuenta cada negocio aceptado cuya fecha límite cayó en los
 * últimos 180 días y está cumplido si se publicó a tiempo con la evidencia
 * validada.
 */
import { META_CUMPLIMIENTO } from "@/features/dashboard/medio/datos"
import { ESTADOS_PARA_MEDIO } from "@/features/mis-campanas/estados"
import type { EstadoAsignacion } from "@/features/mis-campanas/tipos"
import type { Tono } from "@/features/operacion/estados"
import { formatearNumero, formatearPorcentaje } from "@/lib/format"

import type { CasoReputacion, Reputacion } from "./tipos"

/** Ventana móvil del cumplimiento (la de `mi_reputacion` y del cron). */
export const VENTANA_REPUTACION_DIAS = 180

/** Valor que siembra la migración (`medios.n_minimo_cumplimiento`). */
export const N_MINIMO_CUMPLIMIENTO_POR_DEFECTO = 3

/** La calificación promedio aún no tiene quién la escriba (EP §13, fase 2). */
export const TEXTO_CALIFICACION_PENDIENTE =
  "Llega con la calificación de los anunciantes"

export { META_CUMPLIMIENTO }

/** «1 negocio» · «3 negocios». */
export function negocios(cantidad: number): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "negocio" : "negocios"}`
}

/** «1 publicación» · «12 publicaciones». */
export function publicaciones(cantidad: number): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? "publicación" : "publicaciones"}`
}

// ── Cumplimiento ────────────────────────────────────────────────────────────

export type SituacionCumplimiento =
  /** Ningún negocio con fecha límite en la ventana. */
  | { tipo: "sin-casos"; nMinimo: number }
  /** Hay casos, pero menos que el mínimo: no se muestra una tasa. */
  | { tipo: "sin-historial"; n: number; nMinimo: number }
  | {
      tipo: "tasa"
      tasa: number
      n: number
      cumplidas: number
      /** Alcanza la meta (≥ 90 %). */
      enMeta: boolean
    }

export function situacionCumplimiento({
  tasa,
  n,
  cumplidas,
  nMinimo,
}: Pick<
  Reputacion,
  "tasa" | "n" | "cumplidas" | "nMinimo"
>): SituacionCumplimiento {
  if (tasa !== null && n > 0) {
    return {
      tipo: "tasa",
      tasa,
      n,
      cumplidas,
      enMeta: tasa >= META_CUMPLIMIENTO,
    }
  }
  return n === 0
    ? { tipo: "sin-casos", nMinimo }
    : { tipo: "sin-historial", n, nMinimo }
}

/** La cifra principal: «94%» o «Sin historial suficiente». */
export function valorCumplimiento(situacion: SituacionCumplimiento): string {
  return situacion.tipo === "tasa"
    ? formatearPorcentaje(situacion.tasa, 0)
    : "Sin historial suficiente"
}

/** Lo que acompaña a la cifra: de cuántos negocios sale o cuántos faltan. */
export function detalleCumplimiento(situacion: SituacionCumplimiento): string {
  switch (situacion.tipo) {
    case "tasa":
      return `${formatearNumero(situacion.cumplidas)} de ${negocios(situacion.n)} cumplidos en los últimos ${VENTANA_REPUTACION_DIAS} días.`
    case "sin-historial":
      return `${formatearNumero(situacion.n)} de ${negocios(situacion.nMinimo)} en los últimos ${VENTANA_REPUTACION_DIAS} días. Con ${negocios(situacion.nMinimo)} o más calculamos tu tasa.`
    case "sin-casos":
      return `Aún no tienes negocios con fecha límite en los últimos ${VENTANA_REPUTACION_DIAS} días. Con ${negocios(situacion.nMinimo)} o más calculamos tu tasa.`
  }
}

/** Texto de la meta, para leer junto a la barra. */
export function textoMeta(situacion: SituacionCumplimiento): string | null {
  if (situacion.tipo !== "tasa") return null
  const meta = formatearPorcentaje(META_CUMPLIMIENTO, 0)
  return situacion.enMeta
    ? `Estás en la meta de ${meta} o más.`
    : `La meta es ${meta} o más.`
}

/** Pasos de la regla, para «¿Qué cuenta?». */
export function reglasCumplimiento(nMinimo: number): string[] {
  return [
    `Cuenta cada negocio que aceptaste y cuya fecha límite de publicación cayó en los últimos ${VENTANA_REPUTACION_DIAS} días.`,
    "Está cumplido si publicaste antes de la fecha límite y el equipo AMO validó la evidencia.",
    "No cuentan los negocios de los que desististe a tiempo, los cancelados por causas que no dependen de ti ni los que esperan la revisión de la evidencia o una disputa.",
    `Con menos de ${negocios(nMinimo)} no mostramos una tasa: diría poco de tu trabajo.`,
  ]
}

// ── Casos ───────────────────────────────────────────────────────────────────

export interface PresentacionCaso {
  etiqueta: "Cumplido" | "No cumplido"
  tono: Tono
  /** Por qué cuenta así, en voz del medio. */
  motivo: string
  /** El estado del negocio, como lo ve el medio en «Mis campañas». */
  estado: string
}

const SIN_EVIDENCIA_A_TIEMPO =
  "Pasó la fecha límite sin la evidencia de la publicación."

const MOTIVO_NO_CUMPLIDO: Partial<Record<EstadoAsignacion, string>> = {
  ACEPTADA: SIN_EVIDENCIA_A_TIEMPO,
  CONTENIDO_ENTREGADO: SIN_EVIDENCIA_A_TIEMPO,
  VENCIDA_SIN_PUBLICAR: SIN_EVIDENCIA_A_TIEMPO,
  CANCELADA: "El equipo AMO canceló tu participación por incumplimiento.",
  EN_DISPUTA:
    "En disputa: no se publicó a tiempo o la evidencia aún no está validada.",
}

export function presentarCaso(caso: CasoReputacion): PresentacionCaso {
  const estado = ESTADOS_PARA_MEDIO[caso.estado].etiqueta
  if (caso.cumplida) {
    return {
      etiqueta: "Cumplido",
      tono: "exito",
      motivo: "Publicaste a tiempo y el equipo AMO validó la evidencia.",
      estado,
    }
  }
  return {
    etiqueta: "No cumplido",
    tono: "peligro",
    // Con la evidencia ya validada, lo que falló fue la fecha de publicación.
    motivo:
      MOTIVO_NO_CUMPLIDO[caso.estado] ??
      "Publicaste después de la fecha límite.",
    estado,
  }
}

/** Cuántos de los casos no se cumplieron (para el resumen de la lista). */
export function noCumplidos(casos: readonly CasoReputacion[]): number {
  return casos.filter((caso) => !caso.cumplida).length
}
