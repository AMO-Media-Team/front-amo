/**
 * Fechas de calendario y rangos en la zona de Colombia. Vercel ejecuta en UTC,
 * así que todo cálculo de "día" pasa por `tz(ZONA)`; nunca por la zona local.
 */
import { TZDate, tz } from "@date-fns/tz"
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  isLastDayOfMonth,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns"

export const ZONA = "America/Bogota"

const enBogota = { in: tz(ZONA) }

/**
 * date-fns con `in` devuelve `TZDate`; se entregan `Date` planos para que
 * serialicen igual en RSC/JSON y se comparen sin sorpresas.
 */
function plano(fecha: Date): Date {
  return new Date(fecha.getTime())
}

export const PRESETS_RANGO = [
  "hoy",
  "ultimos7",
  "ultimos30",
  "esteMes",
  "mesAnterior",
  "esteTrimestre",
  "esteAno",
  "personalizado",
] as const

export type PresetRango = (typeof PRESETS_RANGO)[number]
export type PresetAutomatico = Exclude<PresetRango, "personalizado">

export const ETIQUETAS_PRESET: Record<PresetRango, string> = {
  hoy: "Hoy",
  ultimos7: "Últimos 7 días",
  ultimos30: "Últimos 30 días",
  esteMes: "Este mes",
  mesAnterior: "Mes anterior",
  esteTrimestre: "Este trimestre",
  esteAno: "Este año",
  personalizado: "Personalizado",
}

export const PRESET_POR_DEFECTO: PresetAutomatico = "ultimos30"

/** Días de calendario inclusivos, a las 00:00 de Bogotá. */
export interface RangoFechas {
  preset: PresetRango
  desde: Date
  hasta: Date
}

export function esPresetRango(valor: unknown): valor is PresetRango {
  return PRESETS_RANGO.includes(valor as PresetRango)
}

/** Inicio del día en Bogotá del instante dado. */
export function inicioDelDia(fecha: Date): Date {
  return plano(startOfDay(fecha, enBogota))
}

export function rangoDesdePreset(
  preset: PresetAutomatico,
  ahora: Date = new Date()
): RangoFechas {
  const hoy = inicioDelDia(ahora)
  const rango = (desde: Date, hasta: Date = hoy): RangoFechas => ({
    preset,
    desde: plano(desde),
    hasta: plano(hasta),
  })

  switch (preset) {
    case "hoy":
      return rango(hoy)
    case "ultimos7":
      return rango(subDays(hoy, 6, enBogota))
    case "ultimos30":
      return rango(subDays(hoy, 29, enBogota))
    case "esteMes":
      return rango(startOfMonth(hoy, enBogota))
    case "mesAnterior": {
      const mesPasado = subMonths(hoy, 1, enBogota)
      return rango(
        startOfMonth(mesPasado, enBogota),
        inicioDelDia(endOfMonth(mesPasado, enBogota))
      )
    }
    case "esteTrimestre":
      return rango(startOfQuarter(hoy, enBogota))
    case "esteAno":
      return rango(startOfYear(hoy, enBogota))
  }
}

/** Rango elegido a mano; ordena los extremos si llegan invertidos. */
export function rangoPersonalizado(a: Date, b: Date): RangoFechas {
  const [desde, hasta] = [inicioDelDia(a), inicioDelDia(b)].sort(
    (x, y) => x.getTime() - y.getTime()
  )
  return { preset: "personalizado", desde, hasta }
}

export function diasEnRango(rango: RangoFechas): number {
  return differenceInCalendarDays(rango.hasta, rango.desde, enBogota) + 1
}

function desplazarMeses(rango: RangoFechas, meses: number): RangoFechas {
  const hasta = subMonths(rango.hasta, meses, enBogota)
  return {
    preset: "personalizado",
    desde: plano(subMonths(rango.desde, meses, enBogota)),
    // Un mes completo se compara con el mes completo anterior (30 vs 31 días).
    hasta: isLastDayOfMonth(rango.hasta, enBogota)
      ? inicioDelDia(endOfMonth(hasta, enBogota))
      : plano(hasta),
  }
}

/**
 * Periodo equivalente inmediatamente anterior, para comparativos:
 * meses y trimestres contra sus homólogos (a la misma altura del periodo),
 * el año contra el mismo tramo del año pasado y el resto contra los N días previos.
 */
export function periodoAnterior(rango: RangoFechas): RangoFechas {
  switch (rango.preset) {
    case "esteMes":
    case "mesAnterior":
      return desplazarMeses(rango, 1)
    case "esteTrimestre":
      return desplazarMeses(rango, 3)
    case "esteAno":
      return {
        preset: "personalizado",
        desde: plano(subYears(rango.desde, 1, enBogota)),
        hasta: plano(subYears(rango.hasta, 1, enBogota)),
      }
    default: {
      const dias = diasEnRango(rango)
      return {
        preset: "personalizado",
        desde: plano(subDays(rango.desde, dias, enBogota)),
        hasta: plano(subDays(rango.hasta, dias, enBogota)),
      }
    }
  }
}

/**
 * Instantes para filtrar columnas `timestamptz`: [desde 00:00, hasta+1 00:00)
 * en Bogotá, expresados en ISO UTC.
 */
export function instantesDelRango(rango: RangoFechas): {
  desde: string
  hastaExclusivo: string
} {
  return {
    desde: rango.desde.toISOString(),
    hastaExclusivo: plano(addDays(rango.hasta, 1, enBogota)).toISOString(),
  }
}

// ── Serialización para URL ('YYYY-MM-DD') ──────────────────────────────────

const FORMATO_ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/

const diaBogota = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Día de calendario en Bogotá como 'YYYY-MM-DD'. */
export function serializarFecha(fecha: Date): string {
  const partes = Object.fromEntries(
    diaBogota.formatToParts(fecha).map(({ type, value }) => [type, value])
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}

/** 'YYYY-MM-DD' → 00:00 de ese día en Bogotá; `null` si el texto no es una fecha real. */
export function parsearFecha(texto: string | null | undefined): Date | null {
  const coincidencia = texto ? FORMATO_ISO_DIA.exec(texto.trim()) : null
  if (!coincidencia) return null
  const [anio, mes, dia] = coincidencia.slice(1).map(Number)
  const fecha = new TZDate(anio, mes - 1, dia, ZONA)
  const esValida =
    fecha.getFullYear() === anio &&
    fecha.getMonth() === mes - 1 &&
    fecha.getDate() === dia
  return esValida ? plano(fecha) : null
}

export interface RangoSerializado {
  preset: PresetRango
  desde: string
  hasta: string
}

export function serializarRango(rango: RangoFechas): RangoSerializado {
  return {
    preset: rango.preset,
    desde: serializarFecha(rango.desde),
    hasta: serializarFecha(rango.hasta),
  }
}

/**
 * Reconstruye un rango desde la URL. Un preset automático se recalcula con
 * `ahora` (los enlaces "últimos 30 días" siguen vigentes); un personalizado
 * inválido o incompleto cae al preset por defecto.
 */
export function parsearRango(
  valores: {
    preset?: string | null
    desde?: string | null
    hasta?: string | null
  },
  ahora: Date = new Date()
): RangoFechas {
  const preset = esPresetRango(valores.preset) ? valores.preset : undefined

  if (preset && preset !== "personalizado") {
    return rangoDesdePreset(preset, ahora)
  }

  const desde = parsearFecha(valores.desde)
  const hasta = parsearFecha(valores.hasta)
  if (desde && hasta) return rangoPersonalizado(desde, hasta)

  return rangoDesdePreset(PRESET_POR_DEFECTO, ahora)
}
