/**
 * Agrupación de la línea de tiempo por día de Bogotá (módulo puro).
 */
import { parsearFecha, serializarFecha, ZONA } from "@/lib/fechas"

export interface GrupoDia<T> {
  /** `YYYY-MM-DD` en Bogotá. */
  clave: string
  titulo: string
  eventos: T[]
}

const diaLargo = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  weekday: "long",
  day: "numeric",
  month: "long",
})
const anio = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  year: "numeric",
})

/** "Hoy", "Ayer", "lunes, 28 de septiembre" o "… de 2025" si es de otro año. */
export function tituloDia(clave: string, ahora: Date = new Date()): string {
  const hoy = serializarFecha(ahora)
  const ayer = serializarFecha(new Date(ahora.getTime() - 86_400_000))
  if (clave === hoy) return "Hoy"
  if (clave === ayer) return "Ayer"
  const fecha = parsearFecha(clave)
  if (!fecha) return clave
  const texto = diaLargo.format(fecha)
  const capitalizado =
    texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1)
  return anio.format(fecha) === anio.format(ahora)
    ? capitalizado
    : `${capitalizado} de ${anio.format(fecha)}`
}

/** Eventos (ya ordenados) agrupados por día, conservando el orden de llegada. */
export function agruparPorDia<T extends { at: string }>(
  eventos: readonly T[],
  ahora: Date = new Date()
): GrupoDia<T>[] {
  const grupos: GrupoDia<T>[] = []
  for (const evento of eventos) {
    const clave = serializarFecha(new Date(evento.at))
    const ultimo = grupos.at(-1)
    if (ultimo?.clave === clave) {
      ultimo.eventos.push(evento)
    } else {
      grupos.push({ clave, titulo: tituloDia(clave, ahora), eventos: [evento] })
    }
  }
  return grupos
}

const hora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA,
  hour: "numeric",
  minute: "2-digit",
})

/** "3:05 p. m." (hora de Bogotá). */
export function formatearHora(instante: string): string {
  const fecha = new Date(instante)
  return Number.isNaN(fecha.getTime()) ? "—" : hora.format(fecha)
}

export interface EventoCompactable {
  id: number
  at: string
  titulo: string
  entidad: string
  actor: { id: string | null }
}

export type ElementoLinea<T> =
  { tipo: "evento"; evento: T } | { tipo: "grupo"; clave: string; eventos: T[] }

/** Separación máxima entre eventos de una misma ráfaga. */
export const VENTANA_RAFAGA_MS = 5 * 60_000
/** Desde cuántos eventos seguidos iguales se pliegan en uno. */
export const MINIMO_RAFAGA = 3

function mismaRafaga(
  a: EventoCompactable,
  b: EventoCompactable,
  ventanaMs: number
): boolean {
  return (
    a.titulo === b.titulo &&
    a.entidad === b.entidad &&
    a.actor.id === b.actor.id &&
    Math.abs(Date.parse(a.at) - Date.parse(b.at)) <= ventanaMs
  )
}

/**
 * Pliega las ráfagas: eventos consecutivos con el mismo título, entidad y
 * actor, separados por menos de `ventanaMs` (p. ej. los 30 permisos de un rol
 * guardados de una vez). Menos de `minimo` seguidos se dejan sueltos.
 */
export function compactarSimilares<T extends EventoCompactable>(
  eventos: readonly T[],
  ventanaMs: number = VENTANA_RAFAGA_MS,
  minimo: number = MINIMO_RAFAGA
): ElementoLinea<T>[] {
  const rafagas: T[][] = []
  for (const evento of eventos) {
    const actual = rafagas.at(-1)
    const previo = actual?.at(-1)
    if (actual && previo && mismaRafaga(previo, evento, ventanaMs))
      actual.push(evento)
    else rafagas.push([evento])
  }
  return rafagas.flatMap((rafaga): ElementoLinea<T>[] =>
    rafaga.length >= minimo
      ? [{ tipo: "grupo", clave: `rafaga-${rafaga[0].id}`, eventos: rafaga }]
      : rafaga.map((evento) => ({ tipo: "evento", evento }))
  )
}
