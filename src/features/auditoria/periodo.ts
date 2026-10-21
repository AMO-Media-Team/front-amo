/**
 * Periodo de consulta en la URL, compartido por Auditoría y Accesos:
 * `?periodo=ultimos7` o `?periodo=personalizado&desde=2026-09-01&hasta=2026-09-30`.
 * Un enlace con solo `desde` y `hasta` (el formato de los insights y del
 * explorador geográfico) también se lee como rango personalizado.
 * Módulo puro (sin `"use client"`): la página lo lee en el servidor con
 * `cargarPeriodo(searchParams)` y el selector lo escribe en el cliente con los
 * MISMOS parsers. Sin parámetros rige `PRESET_POR_DEFECTO` (últimos 30 días).
 */
import {
  createLoader,
  createParser,
  type inferParserType,
  parseAsStringLiteral,
} from "nuqs/server"
import { z } from "zod"

import {
  ETIQUETAS_PRESET,
  instantesDelRango,
  parsearFecha,
  parsearRango,
  periodoAnterior,
  PRESET_POR_DEFECTO,
  type PresetRango,
  PRESETS_RANGO,
  type RangoFechas,
  ZONA,
} from "@/lib/fechas"

/** Día de calendario `YYYY-MM-DD`; cualquier otro texto se ignora. */
const parseAsDia = createParser<string>({
  parse: (valor) => (parsearFecha(valor) ? valor : null),
  serialize: (valor) => valor,
})

export const parsersPeriodo = {
  /** `null` = por defecto (o personalizado, si llegan `desde` y `hasta`). */
  periodo: parseAsStringLiteral(PRESETS_RANGO),
  desde: parseAsDia,
  hasta: parseAsDia,
}

export type ValoresPeriodo = inferParserType<typeof parsersPeriodo>

const cargarValoresPeriodo = createLoader(parsersPeriodo)

/** Preset efectivo: el explícito; si no, personalizado con fechas o el de por defecto. */
export function presetDeValores(valores: ValoresPeriodo): PresetRango {
  if (valores.periodo) return valores.periodo
  return valores.desde && valores.hasta ? "personalizado" : PRESET_POR_DEFECTO
}

/** Rango de fechas de Bogotá que representan los valores de la URL. */
export function rangoDeValores(
  valores: ValoresPeriodo,
  ahora: Date = new Date()
): RangoFechas {
  return parsearRango(
    {
      preset: presetDeValores(valores),
      desde: valores.desde,
      hasta: valores.hasta,
    },
    ahora
  )
}

/** Servidor: `await cargarPeriodo(props.searchParams)`. */
export async function cargarPeriodo(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<{ valores: ValoresPeriodo; rango: RangoFechas }> {
  const valores = await cargarValoresPeriodo(searchParams)
  return { valores, rango: rangoDeValores(valores) }
}

/** Mismo contrato que la URL, para las entradas de las Server Actions. */
export const esquemaPeriodo = z.object({
  periodo: z.enum(PRESETS_RANGO).nullable(),
  desde: z.string().max(10).nullable(),
  hasta: z.string().max(10).nullable(),
})

/** Instantes UTC `[desde, hastaExclusivo)` para filtrar `created_at`. */
export interface VentanaTiempo {
  desde: string
  hastaExclusivo: string
}

export function ventanaDe(rango: RangoFechas): VentanaTiempo {
  return instantesDelRango(rango)
}

/** Ventana del periodo y la del periodo equivalente anterior (comparativos). */
export function ventanasComparadas(rango: RangoFechas): {
  actual: VentanaTiempo
  anterior: VentanaTiempo
} {
  return {
    actual: ventanaDe(rango),
    anterior: ventanaDe(periodoAnterior(rango)),
  }
}

const diaMes = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
})
const diaMesAnio = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** "Últimos 30 días" o, si es personalizado, "1 de sept – 30 de sept de 2026". */
export function etiquetaRango(rango: RangoFechas): string {
  if (rango.preset !== "personalizado") return ETIQUETAS_PRESET[rango.preset]
  if (rango.desde.getTime() === rango.hasta.getTime()) {
    return diaMesAnio.format(rango.hasta)
  }
  const mismoAnio =
    diaMesAnio.formatToParts(rango.desde).find((p) => p.type === "year")
      ?.value ===
    diaMesAnio.formatToParts(rango.hasta).find((p) => p.type === "year")?.value
  const inicio = mismoAnio
    ? diaMes.format(rango.desde)
    : diaMesAnio.format(rango.desde)
  return `${inicio} – ${diaMesAnio.format(rango.hasta)}`
}

/** "frente a ayer", "frente al mes anterior"…: texto que acompaña a las variaciones. */
export function etiquetaComparacion(rango: RangoFechas): string {
  switch (rango.preset) {
    case "hoy":
      return "frente a ayer"
    case "esteMes":
    case "mesAnterior":
      return "frente al mes anterior"
    case "esteTrimestre":
      return "frente al trimestre anterior"
    case "esteAno":
      return "frente al año pasado"
    default:
      return "frente al periodo anterior"
  }
}
