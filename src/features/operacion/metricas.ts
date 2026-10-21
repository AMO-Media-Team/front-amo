/**
 * Métricas por corte de una publicación (módulo puro): nombres de las
 * columnas según la plataforma (TikTok no reporta alcance ni impresiones),
 * engagement y la explicación en lenguaje llano de las alertas de integridad
 * que calcula la BD (`trg_metricas_b_alertas`, docs/modelo-datos.md §3.6).
 */
import { formatearNumero } from "@/lib/format"

import {
  CORTES,
  type Corte,
  type EstadoValidacion,
  type Plataforma,
} from "./estados"

export interface DetalleAlertas {
  medianaHistorica: number | null
  nHistorial: number | null
  factor: number | null
  seguidores: number | null
  multiplo: number | null
}

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
  alertaDesviacion: boolean
  alertaMultiplo: boolean
  detalleAlertas: DetalleAlertas
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

function numeroDe(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor
  if (typeof valor === "string" && valor.trim() !== "") {
    const numero = Number(valor)
    return Number.isFinite(numero) ? numero : null
  }
  return null
}

/** `metricas.detalle_alertas` (jsonb) → objeto tipado y tolerante a faltantes. */
export function leerDetalleAlertas(valor: unknown): DetalleAlertas {
  const objeto =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {}
  return {
    medianaHistorica: numeroDe(objeto.mediana_historica),
    nHistorial: numeroDe(objeto.n_historial),
    factor: numeroDe(objeto.factor),
    seguidores: numeroDe(objeto.seguidores),
    multiplo: numeroDe(objeto.multiplo),
  }
}

/** Por qué se marcó el corte, para quien valida. */
export function describirAlertas(
  corte: Pick<
    CorteMetrica,
    "alertaDesviacion" | "alertaMultiplo" | "detalleAlertas" | "alcance"
  >
): string[] {
  const { detalleAlertas: detalle } = corte
  const motivos: string[] = []
  if (corte.alertaMultiplo) {
    const limite =
      detalle.multiplo !== null && detalle.seguidores !== null
        ? ` (límite: ${formatearNumero(detalle.multiplo, 1)} × ${formatearNumero(detalle.seguidores)} seguidores)`
        : ""
    motivos.push(
      `El alcance reportado supera lo esperable para sus seguidores${limite}.`
    )
  }
  if (corte.alertaDesviacion) {
    const referencia =
      detalle.medianaHistorica !== null
        ? ` (mediana de sus publicaciones aprobadas: ${formatearNumero(detalle.medianaHistorica)}${
            detalle.factor !== null
              ? `; se alerta fuera de ${formatearNumero(detalle.factor, 1)} ×`
              : ""
          })`
        : ""
    motivos.push(`Se desvía del histórico del medio${referencia}.`)
  }
  return motivos
}

export function tieneAlerta(
  corte: Pick<CorteMetrica, "alertaDesviacion" | "alertaMultiplo">
): boolean {
  return corte.alertaDesviacion || corte.alertaMultiplo
}
