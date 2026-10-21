/**
 * Formato de valores del mapa según la unidad de la métrica (es-CO, COP sin
 * decimales, fracciones como porcentaje).
 */
import { parsearFecha, ZONA } from "@/lib/fechas"
import {
  formatearCompacto,
  formatearCOP,
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
  LOCALE,
} from "@/lib/format"

import { DEFINICIONES_METRICAS, type MetricaGeo } from "./metricas"
import type { GranularidadSerie } from "./serie"
import type { RespuestaPuntosGeo } from "./tipos"

export interface OpcionesFormatoGeo {
  /** "1,2 M" en lugar de "1.234.567" (leyendas, etiquetas estrechas). */
  readonly compacto?: boolean
  /** Valor por cada 100 mil habitantes. */
  readonly por100k?: boolean
}

export function formatearValorGeo(
  valor: number | null | undefined,
  metrica: MetricaGeo,
  { compacto = false, por100k = false }: OpcionesFormatoGeo = {}
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return "Sin datos"
  }

  switch (DEFINICIONES_METRICAS[metrica].unidad) {
    case "cop":
      return compacto ? formatearCOPCompacto(valor) : formatearCOP(valor)
    case "porcentaje":
      return formatearPorcentaje(valor, 1)
    case "conteo":
    case "personas":
      if (compacto && valor >= 10_000) return formatearCompacto(valor)
      // Las tasas por 100 mil habitantes suelen ser pequeñas: decimales útiles.
      return formatearNumero(valor, por100k ? decimalesTasa(valor) : 0)
  }
}

/** Participación de una zona en el total ("12,1 %"). */
export function formatearParticipacion(fraccion: number): string {
  return formatearPorcentaje(fraccion, 1)
}

function decimalesTasa(valor: number): number {
  if (valor < 10) return 2
  return valor < 100 ? 1 : 0
}

/** Rótulo de unidad para acompañar cifras ("medios", "por 100 mil hab."). */
export function unidadGeo(metrica: MetricaGeo, por100k = false): string {
  if (por100k) return "por 100 mil hab."
  switch (metrica) {
    case "medios":
      return "medios"
    case "campanas":
      return "campañas"
    case "asignaciones":
      return "asignaciones"
    case "anunciantes":
      return "anunciantes"
    case "accesos":
      return "accesos"
    case "alcance":
    case "audiencia":
      return "personas"
    case "gmv":
    case "cumplimiento":
      return ""
  }
}

const formatoPeriodo = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** "1–30 sept 2026" · "15 ago – 30 sept 2026" (hora de Bogotá). */
export function formatearPeriodo(desde: Date, hasta: Date): string {
  return formatoPeriodo.formatRange(desde, hasta)
}

/** Kilómetros aproximados que mide una celda de `grados` en el ecuador. */
const KM_POR_GRADO = 111.32

/**
 * Nota del modo calor: qué se ve y con qué precisión ("1.234 ingresos con
 * ubicación · celdas de ≈ 6 km"). Avisa si la lectura se muestreó.
 */
export function describirPuntosCalor(respuesta: RespuestaPuntosGeo): string {
  const { consulta, total, muestra, pasoGrados } = respuesta
  if (consulta.metrica === "medios") {
    return `${formatearNumero(total)} ${total === 1 ? "medio" : "medios"} · en la cabecera de su municipio`
  }
  const km = Math.max(1, Math.round(pasoGrados * KM_POR_GRADO))
  const partes = [
    `${formatearNumero(total)} ${total === 1 ? "ingreso" : "ingresos"} con ubicación`,
    `celdas de ≈ ${formatearNumero(km)} km`,
  ]
  if (muestra < total) partes.push(`muestra de ${formatearNumero(muestra)}`)
  return partes.join(" · ")
}

/** Por qué el modo calor no dibuja nada (el coroplético sí tiene datos). */
export function describirCalorVacio(metrica: MetricaGeo): string {
  return metrica === "medios"
    ? "No hay medios verificados que ubicar al cierre del periodo: se muestra el mapa por zonas."
    : "Ningún ingreso del periodo trae coordenadas: se muestra el mapa por zonas."
}

const formatoDiaSemana = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  weekday: "short",
  day: "numeric",
  month: "short",
})
const formatoDiaMes = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
})
const formatoMes = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA,
  month: "short",
  year: "numeric",
})

/** Rótulo de una cubeta de la serie: "jue, 24 sept" · "7 a 13 de sept" · "sept 2026". */
export function etiquetaCubeta(
  cubeta: { readonly desde: string; readonly hasta: string },
  granularidad: GranularidadSerie
): string {
  const desde = parsearFecha(cubeta.desde)
  const hasta = parsearFecha(cubeta.hasta)
  if (!desde || !hasta) return cubeta.desde
  switch (granularidad) {
    case "dia":
      return formatoDiaSemana.format(desde)
    case "semana":
      return formatoDiaMes.formatRange(desde, hasta)
    case "mes":
      return formatoMes.format(desde)
  }
}

/** "Evolución diaria/semanal/mensual". */
export const TITULO_SERIE: Readonly<Record<GranularidadSerie, string>> = {
  dia: "Evolución diaria",
  semana: "Evolución semanal",
  mes: "Evolución mensual",
}
