/**
 * Instantes de una oferta (ventana de publicación y fecha límite de
 * aceptación) en hora de Bogotá, guardados como `timestamptz` (módulo puro,
 * cliente y servidor). El formulario los maneja como ISO UTC; la persona los
 * elige como día + hora de Colombia.
 */
import { TZDate, tz } from "@date-fns/tz"
import { addDays, addMinutes } from "date-fns"

import { parsearFecha, ZONA } from "@/lib/fechas"

const enBogota = { in: tz(ZONA) }
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/
const MS_HORA = 3_600_000

export interface DiaYHora {
  /** 'YYYY-MM-DD' en Bogotá ('' sin día). */
  dia: string
  /** 'HH:mm' de 24 horas en Bogotá ('' sin hora). */
  hora: string
}

const partesBogota = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** Instante de un ISO, o null si no es una fecha. */
export function instante(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** Día y hora de Bogotá → ISO UTC; null si falta alguno o no es válido. */
export function combinarFechaHora(dia: string, hora: string): string | null {
  const fecha = parsearFecha(dia)
  const coincidencia = HORA.exec(hora.trim())
  if (!fecha || !coincidencia) return null
  const [horas, minutos] = coincidencia.slice(1).map(Number)
  const local = new TZDate(fecha.getTime(), ZONA)
  local.setHours(horas, minutos, 0, 0)
  return new Date(local.getTime()).toISOString()
}

/** ISO → día y hora de Bogotá (vacíos si no es una fecha). */
export function separarFechaHora(iso: string | null | undefined): DiaYHora {
  const fecha = instante(iso)
  if (!fecha) return { dia: "", hora: "" }
  const partes = Object.fromEntries(
    partesBogota.formatToParts(fecha).map(({ type, value }) => [type, value])
  )
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  }
}

/** 00:00 de Bogotá del primer día de la campaña. */
export function inicioDeCampana(fechaInicio: string): Date | null {
  return parsearFecha(fechaInicio)
}

/**
 * Límite exclusivo del último día de la campaña: 00:00 de Bogotá del día
 * siguiente (`private.inicio_dia(fecha_fin + 1)`).
 */
export function finDeCampana(fechaFin: string): Date | null {
  const fecha = parsearFecha(fechaFin)
  return fecha ? new Date(addDays(fecha, 1, enBogota).getTime()) : null
}

/** Primer instante válido para la fecha límite: ahora + anticipación mínima. */
export function minimoFechaLimite(
  ahora: Date,
  anticipacionHoras: number
): Date {
  return new Date(ahora.getTime() + Math.max(0, anticipacionHoras) * MS_HORA)
}

/** Redondea hacia arriba a la hora en punto (Bogotá no tiene minutos de desfase). */
function aLaHoraSiguiente(fecha: Date): Date {
  return new Date(Math.ceil(fecha.getTime() / MS_HORA) * MS_HORA)
}

export interface InstantesOferta {
  ventanaInicio: string
  ventanaFin: string
  fechaLimite: string
}

/**
 * Valores iniciales de una oferta nueva: la ventana cubre lo que queda de la
 * campaña (desde hoy o su inicio hasta las 11:59 p. m. de su último día) y la
 * fecha límite queda una hora después de la anticipación mínima, en punto,
 * sin pasar del fin de la ventana. Si la campaña es demasiado corta, la
 * validación lo explica al avanzar.
 */
export function instantesPorDefecto({
  fechaInicio,
  fechaFin,
  anticipacionHoras,
  ahora,
}: {
  fechaInicio: string
  fechaFin: string
  anticipacionHoras: number
  ahora: Date
}): InstantesOferta {
  const hoy = parsearFecha(separarFechaHora(ahora.toISOString()).dia) ?? ahora
  const inicioCampana = inicioDeCampana(fechaInicio) ?? hoy
  const finCampana = finDeCampana(fechaFin) ?? addDays(hoy, 30, enBogota)
  const inicio = new Date(Math.max(inicioCampana.getTime(), hoy.getTime()))
  const fin = new Date(addMinutes(finCampana, -1).getTime())
  const limite = aLaHoraSiguiente(
    new Date(minimoFechaLimite(ahora, anticipacionHoras).getTime() + MS_HORA)
  )
  return {
    ventanaInicio: inicio.toISOString(),
    ventanaFin: fin.toISOString(),
    fechaLimite: new Date(
      Math.min(limite.getTime(), fin.getTime())
    ).toISOString(),
  }
}
