/**
 * Días de publicación del marketplace (`?desde=&hasta=`, días de Bogotá;
 * módulo puro, cliente y servidor): las opciones rápidas hacia adelante, cuál
 * coincide con lo elegido y el rótulo del filtro. La BD deja las ofertas cuya
 * ventana de publicación toca alguno de esos días.
 */
import { tz } from "@date-fns/tz"
import { addDays, endOfWeek } from "date-fns"

import { etiquetaRango } from "@/features/auditoria/periodo"
import {
  inicioDelDia,
  parsearFecha,
  rangoPersonalizado,
  serializarFecha,
  ZONA,
} from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"

const enBogota = { in: tz(ZONA) }

export const OPCIONES_PUBLICACION = [
  "hoy",
  "manana",
  "estaSemana",
  "proximos7",
  "proximos30",
] as const
export type OpcionPublicacion = (typeof OPCIONES_PUBLICACION)[number]

export const ETIQUETAS_PUBLICACION: Readonly<
  Record<OpcionPublicacion, string>
> = {
  hoy: "Hoy",
  manana: "Mañana",
  estaSemana: "Esta semana",
  proximos7: "Próximos 7 días",
  proximos30: "Próximos 30 días",
}

/** Rótulo del filtro sin días elegidos. */
export const SIN_DIAS_PUBLICACION = "Cualquier día"

export interface DiasPublicacion {
  /** `YYYY-MM-DD` (Bogotá); `null` = sin límite por ese lado. */
  desde: string | null
  hasta: string | null
}

/** Primer y último día de una opción rápida, contados desde hoy en Bogotá. */
export function diasDeOpcion(
  opcion: OpcionPublicacion,
  ahora: Date = new Date()
): { desde: string; hasta: string } {
  const hoy = inicioDelDia(ahora)
  const tramo = (desde: Date, hasta: Date) => ({
    desde: serializarFecha(desde),
    hasta: serializarFecha(hasta),
  })
  switch (opcion) {
    case "hoy":
      return tramo(hoy, hoy)
    case "manana": {
      const manana = addDays(hoy, 1, enBogota)
      return tramo(manana, manana)
    }
    case "estaSemana":
      // La semana va de lunes a domingo: de hoy al domingo.
      return tramo(hoy, endOfWeek(hoy, { weekStartsOn: 1, ...enBogota }))
    case "proximos7":
      return tramo(hoy, addDays(hoy, 6, enBogota))
    case "proximos30":
      return tramo(hoy, addDays(hoy, 29, enBogota))
  }
}

/** La opción rápida que coincide con los días elegidos (la primera), o `null`. */
export function opcionActivaPublicacion(
  dias: DiasPublicacion,
  ahora: Date = new Date()
): OpcionPublicacion | null {
  if (!dias.desde || !dias.hasta) return null
  return (
    OPCIONES_PUBLICACION.find((opcion) => {
      const tramo = diasDeOpcion(opcion, ahora)
      return tramo.desde === dias.desde && tramo.hasta === dias.hasta
    }) ?? null
  )
}

/**
 * Rótulo del filtro: «Cualquier día», la opción rápida que coincide («Esta
 * semana»), un día («24 de oct de 2026»), un tramo («24 – 31 de oct de 2026»)
 * o un solo extremo («Desde el 24 de oct de 2026»).
 */
export function etiquetaPublicacion(
  dias: DiasPublicacion,
  ahora: Date = new Date()
): string {
  const desde = parsearFecha(dias.desde)
  const hasta = parsearFecha(dias.hasta)
  if (desde && hasta) {
    const opcion = opcionActivaPublicacion(dias, ahora)
    return opcion
      ? ETIQUETAS_PUBLICACION[opcion]
      : etiquetaRango(rangoPersonalizado(desde, hasta))
  }
  if (desde) return `Desde el ${formatearFecha(desde)}`
  if (hasta) return `Hasta el ${formatearFecha(hasta)}`
  return SIN_DIAS_PUBLICACION
}
