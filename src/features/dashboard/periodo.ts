/**
 * Periodo de los paneles de Inicio en la URL, con los mismos parámetros que
 * Auditoría y Accesos (`?periodo=esteMes`, o `?periodo=personalizado&desde=…&hasta=…`)
 * para que los enlaces de los insights funcionen igual en todas las pantallas.
 * Módulo puro: la página lo lee en el servidor y el selector lo escribe en el
 * cliente con los MISMOS parsers. Cada panel tiene su preset por defecto (el
 * medio piensa en "este mes"; el resto, en los últimos 30 días).
 */
import { createLoader } from "nuqs/server"

import {
  etiquetaRango,
  parsersPeriodo,
  type ValoresPeriodo,
} from "@/features/auditoria/periodo"
import {
  diasEnRango,
  parsearFecha,
  periodoAnterior,
  type PresetAutomatico,
  rangoDesdePreset,
  rangoPersonalizado,
  type RangoFechas,
  serializarFecha,
  ZONA,
} from "@/lib/fechas"

export { parsersPeriodo, type ValoresPeriodo }

/** Presets del selector (sin "hoy": un día es poca muestra para comparar tasas). */
export const PRESETS_PANEL = [
  "ultimos7",
  "ultimos30",
  "esteMes",
  "mesAnterior",
  "esteTrimestre",
  "esteAno",
] as const satisfies readonly PresetAutomatico[]

/** Rango máximo consultable (dos años): protege a la BD de consultas enormes. */
export const DIAS_MAXIMOS_PANEL = 731

export const cargarValoresPeriodo = createLoader(parsersPeriodo)

/**
 * Rango efectivo: un preset explícito (aunque no esté en el selector, como
 * `hoy` en un enlace), un rango personalizado válido o el preset del panel.
 */
export function rangoPanel(
  valores: ValoresPeriodo,
  porDefecto: PresetAutomatico,
  ahora: Date = new Date()
): RangoFechas {
  if (valores.periodo && valores.periodo !== "personalizado") {
    return rangoDesdePreset(valores.periodo, ahora)
  }
  const desde = parsearFecha(valores.desde)
  const hasta = parsearFecha(valores.hasta)
  if (desde && hasta) {
    const rango = rangoPersonalizado(desde, hasta)
    if (diasEnRango(rango) <= DIAS_MAXIMOS_PANEL) return rango
  }
  return rangoDesdePreset(porDefecto, ahora)
}

/**
 * Periodo consultado y su comparativo, listos para las RPC ('YYYY-MM-DD'). El
 * comparativo va siempre explícito (docs/kpis.md §0.1: los meses se comparan
 * contra sus homólogos, no contra los N días previos).
 */
export interface PeriodoPanel {
  rango: RangoFechas
  anterior: RangoFechas
  desde: string
  hasta: string
  desdeAnterior: string
  hastaAnterior: string
  dias: number
}

export function periodoPanel(
  valores: ValoresPeriodo,
  porDefecto: PresetAutomatico,
  ahora: Date = new Date()
): PeriodoPanel {
  const rango = rangoPanel(valores, porDefecto, ahora)
  const anterior = periodoAnterior(rango)
  return {
    rango,
    anterior,
    desde: serializarFecha(rango.desde),
    hasta: serializarFecha(rango.hasta),
    desdeAnterior: serializarFecha(anterior.desde),
    hastaAnterior: serializarFecha(anterior.hasta),
    dias: diasEnRango(rango),
  }
}

export type Granularidad = "dia" | "semana" | "mes"

/** Días hasta un mes; semanas hasta un semestre; meses en adelante. */
export function granularidadPara(dias: number): Granularidad {
  if (dias <= 31) return "dia"
  if (dias <= 183) return "semana"
  return "mes"
}

const nombreMes = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  month: "long",
})
const mesCorto = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  month: "short",
})

/**
 * Texto bajo cada variación de las tarjetas KPI. Corto a propósito: junto al
 * sparkline, en media columna a 390 px, caben dos líneas de unos 11
 * caracteres (las fechas exactas del comparativo van bajo el selector).
 */
export function etiquetaComparacionCorta(rango: RangoFechas): string {
  const anterior = periodoAnterior(rango).desde
  switch (rango.preset) {
    case "hoy":
      return "vs. ayer"
    case "ultimos7":
      return "vs. 7 días previos"
    case "ultimos30":
      return "vs. 30 días previos"
    case "esteMes":
      // "sept." → "sept": es-CO añade el punto al mes abreviado.
      return `vs. ${mesCorto.format(anterior).replace(/\.$/, "")} a la fecha`
    case "mesAnterior":
      return `vs. ${nombreMes.format(anterior)}`
    case "esteTrimestre":
      return "vs. trim. anterior"
    case "esteAno":
      return "vs. año pasado"
    case "personalizado":
      return "vs. periodo anterior"
  }
}

/**
 * La misma comparación con todas sus palabras, para donde hay sitio (la cifra
 * principal del medio): "vs. mismos días de septiembre".
 */
export function etiquetaComparacionAmplia(rango: RangoFechas): string {
  switch (rango.preset) {
    case "esteMes":
      return `vs. mismos días de ${nombreMes.format(periodoAnterior(rango).desde)}`
    case "esteTrimestre":
      return "vs. trimestre anterior"
    case "esteAno":
      return "vs. mismo tramo del año pasado"
    default:
      return etiquetaComparacionCorta(rango)
  }
}

/** "1 – 30 sept de 2026": el periodo de comparación, siempre con fechas. */
export function textoPeriodoComparado(anterior: RangoFechas): string {
  return etiquetaRango({ ...anterior, preset: "personalizado" })
}

/** Etiqueta del selector: el nombre del preset o el rango con fechas. */
export function textoPeriodo(rango: RangoFechas): string {
  return etiquetaRango(rango)
}

/** Fechas exactas del periodo (aunque sea un preset), para subtítulos. */
export function textoFechasPeriodo(rango: RangoFechas): string {
  return etiquetaRango({ ...rango, preset: "personalizado" })
}

/** Valores de URL al elegir un preset (el del panel deja la URL limpia). */
export function valoresParaPreset(
  preset: PresetAutomatico,
  porDefecto: PresetAutomatico
): ValoresPeriodo {
  return {
    periodo: preset === porDefecto ? null : preset,
    desde: null,
    hasta: null,
  }
}

/** Valores de URL para un rango del calendario. */
export function valoresParaRango(rango: RangoFechas): ValoresPeriodo {
  return {
    periodo: "personalizado",
    desde: serializarFecha(rango.desde),
    hasta: serializarFecha(rango.hasta),
  }
}
