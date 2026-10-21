/**
 * Presentación de la variación de un KPI frente al periodo anterior: texto,
 * dirección y tono semántico según hacia dónde es "mejor" que se mueva. Las
 * tasas (%) se comparan en puntos porcentuales (docs/kpis.md §0.1).
 */
import {
  formatearPorcentaje,
  type Tendencia,
  tendenciaDelta,
} from "@/lib/format"

import { formatearValorKpi } from "./formato-kpi"
import type { SentidoKpi, UnidadKpi } from "./tipos"

export type TonoDelta = "positivo" | "negativo" | "neutro"
export type TipoDelta = "relativo" | "puntos" | "nuevo" | "sin-comparativo"

export interface PresentacionDelta {
  tipo: TipoDelta
  tendencia: Tendencia
  tono: TonoDelta
  /** "+12,5 %", "−2,1 pp", "Nuevo", "—". */
  texto: string
  /** Frase completa para lectores de pantalla. */
  descripcion: string
}

interface EntradaDelta {
  valor: number | null
  valorAnterior: number | null | undefined
  variacion: number | null | undefined
  unidad: UnidadKpi
  sentido: SentidoKpi
}

const MENOS = "−"
const formatoPuntos = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function tono(tendencia: Tendencia, sentido: SentidoKpi): TonoDelta {
  if (tendencia === "estable" || sentido === "neutro") return "neutro"
  const mejora = (tendencia === "sube") === (sentido === "mayor")
  return mejora ? "positivo" : "negativo"
}

function conSigno(texto: string, tendencia: Tendencia): string {
  if (tendencia === "sube") return `+${texto}`
  if (tendencia === "baja") return `${MENOS}${texto}`
  return texto
}

function describir(
  tendencia: Tendencia,
  magnitud: string,
  referencia: string
): string {
  const cambio =
    tendencia === "estable"
      ? "Se mantuvo"
      : `${tendencia === "sube" ? "Subió" : "Bajó"} ${magnitud}`
  return `${cambio} frente al periodo anterior${referencia}.`
}

export function presentarDelta({
  valor,
  valorAnterior,
  variacion,
  unidad,
  sentido,
}: EntradaDelta): PresentacionDelta {
  const hayAnterior =
    typeof valorAnterior === "number" && Number.isFinite(valorAnterior)
  const referencia = hayAnterior
    ? ` (antes ${formatearValorKpi(valorAnterior, unidad)})`
    : ""

  if (unidad === "%" && valor !== null && hayAnterior) {
    const puntos = (valor - valorAnterior) * 100
    const tendencia = tendenciaDelta(puntos / 100, 1)
    const magnitud = formatoPuntos.format(
      tendencia === "estable" ? 0 : Math.abs(puntos)
    )
    return {
      tipo: "puntos",
      tendencia,
      tono: tono(tendencia, sentido),
      texto: `${conSigno(magnitud, tendencia)} pp`,
      descripcion: describir(
        tendencia,
        `${magnitud} puntos porcentuales`,
        referencia
      ),
    }
  }

  if (typeof variacion === "number" && Number.isFinite(variacion)) {
    const tendencia = tendenciaDelta(variacion, 1)
    const magnitud = formatearPorcentaje(
      tendencia === "estable" ? 0 : Math.abs(variacion),
      1
    )
    return {
      tipo: "relativo",
      tendencia,
      tono: tono(tendencia, sentido),
      texto: conSigno(magnitud, tendencia),
      descripcion: describir(tendencia, magnitud, referencia),
    }
  }

  if (valor !== null && valor > 0 && (!hayAnterior || valorAnterior === 0)) {
    return {
      tipo: "nuevo",
      tendencia: "sube",
      tono: "neutro",
      texto: "Nuevo",
      descripcion: "Sin actividad en el periodo anterior.",
    }
  }

  return {
    tipo: "sin-comparativo",
    tendencia: "estable",
    tono: "neutro",
    texto: "—",
    descripcion: "Sin datos para comparar con el periodo anterior.",
  }
}
