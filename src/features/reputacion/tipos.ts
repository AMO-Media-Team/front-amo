/**
 * Reputación del medio (MED-016): lo que devuelve `mi_reputacion()` ya
 * adaptado. La tasa es `null` mientras el medio no reúna el mínimo de casos
 * de la ventana (`medios.n_minimo_cumplimiento`).
 */
import type { EstadoAsignacion } from "@/features/mis-campanas/tipos"

/** Un negocio que cuenta para el cumplimiento (fecha límite en la ventana). */
export interface CasoReputacion {
  asignacionId: string
  /** Título de la oferta (`null` si ya no se puede leer). */
  oferta: string | null
  /** Fecha límite de publicación (ISO). */
  limite: string
  estado: EstadoAsignacion
  cumplida: boolean
}

export interface Reputacion {
  /** Cumplidos / casos (0–1); `null` con menos casos que el mínimo. */
  tasa: number | null
  /** Casos de la ventana de 180 días. */
  n: number
  cumplidas: number
  /** Casos desde los que hay tasa. */
  nMinimo: number
  /** Publicaciones aprobadas por AMO, desde siempre. */
  publicacionesTotal: number
  /** Publicaciones aprobadas en los últimos 180 días. */
  publicaciones180d: number
  /** Instante del cálculo (ISO): la reputación es a hoy. */
  calculadaAt: string
  /** Del más reciente al más antiguo por fecha límite. */
  casos: CasoReputacion[]
}
