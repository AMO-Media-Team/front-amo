/**
 * Actividad día × hora de los ingresos (módulo puro), con la misma forma que
 * la RPC `actividad_heatmap(…, 'accesos')` de M9 (isodow 1 = lunes, hora 0–23
 * de Bogotá). Mientras la RPC no exista se calcula sobre la muestra del periodo.
 */
import type { CeldaActividad } from "@/components/charts/datos"
import { ZONA } from "@/lib/fechas"

const DIA_ISO: Readonly<Record<string, number>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

const formatoDiaHora = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA,
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
})

/** Día ISO y hora de Bogotá de un instante; `null` si no es una fecha válida. */
export function diaYHora(
  instante: string
): { diaSemana: number; hora: number } | null {
  const fecha = new Date(instante)
  if (Number.isNaN(fecha.getTime())) return null
  const partes = Object.fromEntries(
    formatoDiaHora.formatToParts(fecha).map(({ type, value }) => [type, value])
  )
  const diaSemana = DIA_ISO[partes.weekday ?? ""]
  const hora = Number(partes.hour)
  return diaSemana && Number.isInteger(hora) ? { diaSemana, hora } : null
}

/** Celdas con actividad (las vacías las completa el gráfico). */
export function celdasActividad(
  instantes: readonly string[]
): CeldaActividad[] {
  const conteos = new Map<string, CeldaActividad>()
  for (const instante of instantes) {
    const posicion = diaYHora(instante)
    if (!posicion) continue
    const clave = `${posicion.diaSemana}-${posicion.hora}`
    const celda = conteos.get(clave)
    if (celda) celda.cantidad += 1
    else conteos.set(clave, { ...posicion, cantidad: 1 })
  }
  return [...conteos.values()]
}

/** Franja con más ingresos ("martes a las 9"), para el resumen del gráfico. */
export function celdaPico(
  celdas: readonly CeldaActividad[]
): CeldaActividad | null {
  return celdas.reduce<CeldaActividad | null>(
    (pico, celda) => (!pico || celda.cantidad > pico.cantidad ? celda : pico),
    null
  )
}
