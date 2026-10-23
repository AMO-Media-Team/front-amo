/**
 * Métricas por corte de una publicación (módulo puro): nombres de las
 * columnas según la plataforma (TikTok no reporta alcance ni impresiones),
 * engagement y orden de los cortes. Las alertas de integridad de cada corte
 * (y su explicación) viven en `alertas.ts`: medio y anunciante no las ven; el
 * equipo AMO las lee con `alertas_metricas` (las columnas ya no se leen por
 * PostgREST).
 */
import type { AlertaMetrica } from "./alertas"
import {
  CORTES,
  type Corte,
  type EstadoValidacion,
  type Plataforma,
} from "./estados"

export interface CorteMetrica {
  id: string
  publicacionId: string
  corte: Corte
  fechaCorte: string
  /** `alcance_norm` (en TikTok, espectadores únicos). */
  alcance: number | null
  /** `impresiones_norm` (en TikTok, reproducciones). */
  impresiones: number | null
  interacciones: number | null
  clics: number | null
  estado: EstadoValidacion
  /** Alerta de integridad (INT-003/004), con la previa a una corrección. */
  alerta: AlertaMetrica
  observaciones: string | null
  validadaAt: string | null
  /** Hay captura que firmar (la ruta no viaja al navegador). */
  conImagen: boolean
}

export interface NombresColumnas {
  alcance: string
  impresiones: string
}

export function nombresColumnas(plataforma: Plataforma): NombresColumnas {
  return plataforma === "TIKTOK"
    ? { alcance: "Espectadores únicos", impresiones: "Reproducciones" }
    : { alcance: "Alcance", impresiones: "Impresiones" }
}

/** Interacciones sobre alcance (docs/kpis.md: engagement); `null` sin alcance. */
export function engagement(
  interacciones: number | null,
  alcance: number | null
): number | null {
  if (interacciones === null || !alcance) return null
  return interacciones / alcance
}

/** Cortes en el orden en que ocurren (24 h → 72 h → 7 días → personalizado). */
export function ordenarCortes<
  T extends Pick<CorteMetrica, "corte" | "fechaCorte">,
>(cortes: readonly T[]): T[] {
  return [...cortes].sort(
    (a, b) =>
      CORTES[a.corte].orden - CORTES[b.corte].orden ||
      a.fechaCorte.localeCompare(b.fechaCorte)
  )
}
