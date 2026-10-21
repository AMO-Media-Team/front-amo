/**
 * Estado del explorador en la URL (nuqs). Módulo puro: los mismos parsers
 * sirven al cliente (`useQueryStates`) y al servidor (`createLoader`).
 *
 *   /analitica/mapa?nivel=departamental&depto=05&metrica=gmv&desde=2026-09-01&hasta=2026-09-30
 *
 * `nivel`, `depto`, `metrica` y las fechas se escriben con `history: push`
 * (Atrás deshace el último cambio); las vistas (tasa y calor), con `replace`.
 */
import {
  createLoader,
  createParser,
  parseAsBoolean,
  parseAsStringLiteral,
} from "nuqs/server"

import {
  diasEnRango,
  ETIQUETAS_PRESET,
  PRESET_POR_DEFECTO,
  type PresetAutomatico,
  parsearFecha,
  rangoDesdePreset,
  rangoPersonalizado,
  type RangoFechas,
  serializarFecha,
} from "@/lib/fechas"

import { departamentoPorCodigo } from "./departamentos"
import { METRICAS_GEO, NIVELES_GEO } from "./metricas"

/** Rango máximo consultable (dos años): protege a la BD de consultas enormes. */
export const DIAS_MAXIMOS_RANGO = 731

/** Día de calendario 'YYYY-MM-DD' (Bogotá); se conserva como texto. */
export const parseAsDia = createParser({
  parse: (valor: string) => (parsearFecha(valor) ? valor : null),
  serialize: (valor: string) => valor,
})

/** Código DANE de un departamento existente. */
export const parseAsCodigoDepartamento = createParser({
  parse: (valor: string) =>
    /^\d{2}$/.test(valor) && departamentoPorCodigo(valor) ? valor : null,
  serialize: (valor: string) => valor,
})

export const parsersMapa = {
  nivel: parseAsStringLiteral(NIVELES_GEO).withDefault("nacional"),
  depto: parseAsCodigoDepartamento,
  metrica: parseAsStringLiteral(METRICAS_GEO),
  desde: parseAsDia,
  hasta: parseAsDia,
  por100k: parseAsBoolean.withDefault(false),
  calor: parseAsBoolean.withDefault(false),
}

export const cargarEstadoMapa = createLoader(parsersMapa)

/** Presets que ofrece el selector de periodo (sin "hoy": un día es poca muestra para un mapa). */
export const PRESETS_MAPA = [
  "ultimos7",
  "ultimos30",
  "esteMes",
  "mesAnterior",
  "esteTrimestre",
  "esteAno",
] as const satisfies readonly PresetAutomatico[]

export type PresetMapa = (typeof PRESETS_MAPA)[number]

export const ETIQUETAS_PRESET_MAPA: Readonly<Record<PresetMapa, string>> =
  Object.fromEntries(
    PRESETS_MAPA.map((p) => [p, ETIQUETAS_PRESET[p]])
  ) as Record<PresetMapa, string>

/**
 * Rango efectivo: el de la URL si ambos extremos son válidos y el intervalo no
 * excede el máximo; si no, los últimos 30 días.
 */
export function rangoDelMapa(
  desde: string | null,
  hasta: string | null,
  ahora: Date = new Date()
): RangoFechas {
  const inicio = parsearFecha(desde)
  const fin = parsearFecha(hasta)
  if (inicio && fin) {
    const rango = rangoPersonalizado(inicio, fin)
    if (diasEnRango(rango) <= DIAS_MAXIMOS_RANGO) {
      return {
        ...rango,
        preset: presetCoincidente(rango, ahora) ?? "personalizado",
      }
    }
  }
  return rangoDesdePreset(PRESET_POR_DEFECTO, ahora)
}

/** Preset cuyo rango coincide exactamente con el dado (para rotular el selector). */
export function presetCoincidente(
  rango: RangoFechas,
  ahora: Date = new Date()
): PresetMapa | null {
  const clave = (r: RangoFechas) =>
    `${serializarFecha(r.desde)}|${serializarFecha(r.hasta)}`
  const buscada = clave(rango)
  return (
    PRESETS_MAPA.find(
      (preset) => clave(rangoDesdePreset(preset, ahora)) === buscada
    ) ?? null
  )
}

/** Valores de URL para un rango; el rango por defecto se omite para dejar la URL limpia. */
export function rangoParaUrl(
  rango: RangoFechas,
  ahora: Date = new Date()
): { desde: string | null; hasta: string | null } {
  if (presetCoincidente(rango, ahora) === PRESET_POR_DEFECTO) {
    return { desde: null, hasta: null }
  }
  return {
    desde: serializarFecha(rango.desde),
    hasta: serializarFecha(rango.hasta),
  }
}
