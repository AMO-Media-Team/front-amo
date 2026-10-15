/**
 * Cubetas de la evolución de una zona (detalle del explorador): ≤ 14 días por
 * día, ≤ 14 semanas (98 días) por semana ISO y, más allá, por mes calendario.
 * La serie mensual llega en la RPC `detalle_zona_geo`; la diaria y la semanal
 * cuestan una lectura de `geo_metricas` por cubeta, así que la granularidad
 * también acota esas lecturas: como máximo `CUBETAS_MAXIMAS_SERIE_FINA` (98
 * días que no empiezan en lunes tocan 15 semanas ISO).
 * Módulo puro: fechas de calendario de Bogotá como 'YYYY-MM-DD'.
 */
import { tz } from "@date-fns/tz"
import { addDays, endOfISOWeek, endOfMonth } from "date-fns"

import {
  diasEnRango,
  inicioDelDia,
  parsearFecha,
  rangoPersonalizado,
  serializarFecha,
  ZONA,
} from "@/lib/fechas"

export type GranularidadSerie = "dia" | "semana" | "mes"

export interface CubetaSerie {
  /** Primer y último día (inclusivos) de la cubeta, recortados al periodo. */
  readonly desde: string
  readonly hasta: string
  /** No cubre la semana o el mes natural completo (primera o última). */
  readonly parcial: boolean
}

export const DIAS_MAXIMOS_SERIE_DIARIA = 14
export const DIAS_MAXIMOS_SERIE_SEMANAL = 98
/** Tope de cubetas diarias o semanales (= lecturas de la BD por detalle). */
export const CUBETAS_MAXIMAS_SERIE_FINA = DIAS_MAXIMOS_SERIE_SEMANAL / 7 + 1

const enBogota = { in: tz(ZONA) }

export function granularidadSerie(dias: number): GranularidadSerie {
  if (dias <= DIAS_MAXIMOS_SERIE_DIARIA) return "dia"
  return dias <= DIAS_MAXIMOS_SERIE_SEMANAL ? "semana" : "mes"
}

/** Último día natural de la cubeta que empieza en `inicio`. */
function finNatural(inicio: Date, granularidad: GranularidadSerie): Date {
  switch (granularidad) {
    case "dia":
      return inicio
    case "semana":
      return inicioDelDia(endOfISOWeek(inicio, enBogota))
    case "mes":
      return inicioDelDia(endOfMonth(inicio, enBogota))
  }
}

/** ¿`inicio` abre una semana (lunes) o un mes (día 1) completos? */
function abrePeriodoNatural(
  inicio: Date,
  granularidad: GranularidadSerie
): boolean {
  if (granularidad === "dia") return true
  const anterior = inicioDelDia(addDays(inicio, -1, enBogota))
  return finNatural(anterior, granularidad).getTime() === anterior.getTime()
}

/** Cubetas consecutivas que cubren el periodo; `null` si las fechas no son válidas. */
export function cubetasSerie(
  desde: string,
  hasta: string
): { granularidad: GranularidadSerie; cubetas: CubetaSerie[] } | null {
  const inicioPeriodo = parsearFecha(desde)
  const finPeriodo = parsearFecha(hasta)
  if (!inicioPeriodo || !finPeriodo || inicioPeriodo > finPeriodo) return null

  const granularidad = granularidadSerie(
    diasEnRango(rangoPersonalizado(inicioPeriodo, finPeriodo))
  )
  const cubetas: CubetaSerie[] = []
  let inicio = inicioPeriodo
  while (inicio <= finPeriodo) {
    const natural = finNatural(inicio, granularidad)
    const fin = natural < finPeriodo ? natural : finPeriodo
    cubetas.push({
      desde: serializarFecha(inicio),
      hasta: serializarFecha(fin),
      parcial:
        fin.getTime() !== natural.getTime() ||
        !abrePeriodoNatural(inicio, granularidad),
    })
    inicio = inicioDelDia(addDays(fin, 1, enBogota))
  }
  return { granularidad, cubetas }
}
