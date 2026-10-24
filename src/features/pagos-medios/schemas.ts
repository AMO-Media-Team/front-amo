/**
 * Entradas de los pagos a medios (módulo puro): los MISMOS esquemas en los
 * diálogos (cliente) y en las Server Actions. La BD vuelve a validarlo todo
 * (`datos_dispersion_srv`, `registrar_dispersion_srv`,
 * `registrar_pago_liquidacion_srv`).
 */
import { z } from "zod"

import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import { parsearFecha, serializarFecha } from "@/lib/fechas"
import { formatearFecha } from "@/lib/format"

import { instanteDeDia } from "@/features/operacion/formato"

import { MAXIMO_POR_ARCHIVO } from "./preparacion"

const id = z.uuid({ error: "Identificador inválido." })

/** Largo máximo de `storage.objects.name`. */
const LARGO_MAXIMO_RUTA = 1024

// ── Archivo de pagos (LIQ-005) ───────────────────────────────────────────────

export const esquemaGenerarArchivoPagos = z.object({
  liquidacionIds: z
    .array(id)
    .min(1, "Elige al menos una liquidación.")
    .max(
      MAXIMO_POR_ARCHIVO,
      `Un archivo de pagos admite hasta ${MAXIMO_POR_ARCHIVO.toLocaleString("es-CO")} liquidaciones.`
    )
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Hay liquidaciones repetidas en la selección.",
    }),
  /** Confirmado: el banco no pagó las que ya estaban en otro archivo. */
  repetir: z.boolean().default(false),
})
export type EntradaGenerarArchivoPagos = z.input<
  typeof esquemaGenerarArchivoPagos
>

export const esquemaDescargarArchivoPagos = z.object({ dispersionId: id })
export type EntradaDescargarArchivoPagos = z.input<
  typeof esquemaDescargarArchivoPagos
>

// ── Soporte y registro del pago (LIQ-006) ────────────────────────────────────

/** Comprobante de la transferencia: PDF o captura (el bucket no admite WebP ni HEIC). */
export const LIMITES_SOPORTE_PAGO: LimitesArchivo = {
  mimes: ["application/pdf", "image/jpeg", "image/png"],
  maxBytes: BUCKETS.soportes.maxBytes,
}

export const REGLAS_SOPORTE_PAGO: ReglasArchivo = LIMITES_SOPORTE_PAGO

export const esquemaPrepararSoportePago = z.object({
  liquidacionId: id,
  descripcion: esquemaDescripcionArchivo(LIMITES_SOPORTE_PAGO),
})
export type EntradaPrepararSoportePago = z.input<
  typeof esquemaPrepararSoportePago
>

export const esquemaConfirmarSoportePago = z.object({
  liquidacionId: id,
  archivo: esquemaArchivoSubido(LIMITES_SOPORTE_PAGO),
})
export type EntradaConfirmarSoportePago = z.input<
  typeof esquemaConfirmarSoportePago
>

export const LARGO_MINIMO_REFERENCIA = 3
/** `liquidaciones_referencia_chk`. */
export const LARGO_MAXIMO_REFERENCIA = 120

export const MENSAJES_FORMULARIO_PAGO = {
  fecha: "Elige la fecha del pago.",
  fechaFutura: "La fecha del pago no puede ser posterior a hoy.",
  referencia: `Escribe la referencia del pago (al menos ${LARGO_MINIMO_REFERENCIA} caracteres).`,
  referenciaLarga: `La referencia admite hasta ${LARGO_MAXIMO_REFERENCIA} caracteres.`,
  soporte: "Carga el soporte del pago: PDF, JPG o PNG de hasta 10 MB.",
} as const

/** «La fecha del pago no puede ser anterior al 3 de oct de 2026.». */
export function mensajeFechaAnterior(minima: string): string {
  return `La fecha del pago no puede ser anterior al ${formatearFecha(instanteDeDia(minima))}.`
}

const fechaPago = z
  .string({ error: MENSAJES_FORMULARIO_PAGO.fecha })
  .refine((valor) => parsearFecha(valor) !== null, {
    message: MENSAJES_FORMULARIO_PAGO.fecha,
  })
  // Día de hoy en Bogotá al validar (cliente y servidor); la BD lo repite.
  .refine((valor) => valor <= serializarFecha(new Date()), {
    message: MENSAJES_FORMULARIO_PAGO.fechaFutura,
  })

const referenciaPago = z
  .string({ error: MENSAJES_FORMULARIO_PAGO.referencia })
  .trim()
  .min(LARGO_MINIMO_REFERENCIA, MENSAJES_FORMULARIO_PAGO.referencia)
  .max(LARGO_MAXIMO_REFERENCIA, MENSAJES_FORMULARIO_PAGO.referenciaLarga)

export const esquemaRegistrarPago = z.object({
  liquidacionId: id,
  fecha: fechaPago,
  referencia: referenciaPago,
  /** Ruta que devolvió `confirmarSoportePago` (el servidor la vuelve a comprobar). */
  soportePath: z
    .string({ error: MENSAJES_FORMULARIO_PAGO.soporte })
    .min(1, MENSAJES_FORMULARIO_PAGO.soporte)
    .max(LARGO_MAXIMO_RUTA),
})
export type EntradaRegistrarPago = z.input<typeof esquemaRegistrarPago>

/**
 * El pago de todo un archivo con un solo comprobante: el soporte se sube una
 * vez (a la carpeta de pago de una de sus liquidaciones) y el servidor lo
 * copia a las demás antes de registrar cada una.
 */
export const esquemaRegistrarPagoArchivo = z.object({
  dispersionId: id,
  liquidacionIds: z
    .array(id)
    .min(1, "No hay liquidaciones por registrar en este archivo.")
    .max(MAXIMO_POR_ARCHIVO)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Hay liquidaciones repetidas.",
    }),
  fecha: fechaPago,
  referencia: referenciaPago,
  soportePath: z
    .string({ error: MENSAJES_FORMULARIO_PAGO.soporte })
    .min(1, MENSAJES_FORMULARIO_PAGO.soporte)
    .max(LARGO_MAXIMO_RUTA),
})
export type EntradaRegistrarPagoArchivo = z.input<
  typeof esquemaRegistrarPagoArchivo
>

const MIME_POR_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
}

/** MIME de un soporte según la extensión de su ruta (`null` si no es uno admitido). */
export function mimeDeSoporte(ruta: string): string | null {
  const extension = ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase()
  return MIME_POR_EXTENSION[extension] ?? null
}

export interface ValoresFormularioPago {
  fecha: string
  referencia: string
  /** Hay un archivo elegido o ya subido. */
  conSoporte: boolean
}

export type ErroresFormularioPago = Partial<
  Record<"fecha" | "referencia" | "soporte", string>
>

/**
 * Validación del diálogo antes de subir el soporte: las mismas reglas que
 * `esquemaRegistrarPago` más la fecha mínima de esa liquidación.
 */
export function validarFormularioPago(
  valores: ValoresFormularioPago,
  fechaMinima: string
): ErroresFormularioPago {
  const errores: ErroresFormularioPago = {}
  const fecha = fechaPago.safeParse(valores.fecha)
  if (!fecha.success) {
    errores.fecha =
      fecha.error.issues[0]?.message ?? MENSAJES_FORMULARIO_PAGO.fecha
  } else if (parsearFecha(fechaMinima) && valores.fecha < fechaMinima) {
    errores.fecha = mensajeFechaAnterior(fechaMinima)
  }
  const referencia = referenciaPago.safeParse(valores.referencia)
  if (!referencia.success) {
    errores.referencia =
      referencia.error.issues[0]?.message ?? MENSAJES_FORMULARIO_PAGO.referencia
  }
  if (!valores.conSoporte) errores.soporte = MENSAJES_FORMULARIO_PAGO.soporte
  return errores
}
