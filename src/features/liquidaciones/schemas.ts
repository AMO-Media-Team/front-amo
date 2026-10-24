/**
 * Esquemas zod de las liquidaciones: los MISMOS en el diálogo y en la Server
 * Action. Los que dependen de «hoy» se construyen con el día de Bogotá
 * (`hoyBogota()` en el servidor; la página se lo pasa al diálogo).
 */
import { z } from "zod"

import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { BUCKETS } from "@/lib/archivos/buckets"
import { parsearFecha } from "@/lib/fechas"

const id = z.uuid({ error: "Identificador inválido." })

/** Máximo de liquidaciones por aprobación (la página más grande de la tabla). */
export const MAXIMO_APROBACION = 100

export const MENSAJES_PERIODO = {
  inicio: "Indica el primer día del periodo.",
  fin: "Indica el último día del periodo.",
  orden: "El último día va después del primero (o es el mismo).",
  abierto:
    "El periodo aún no termina: el último día puede ser hoy como máximo.",
} as const

function dia(mensaje: string) {
  return z
    .string({ error: mensaje })
    .trim()
    .refine((valor) => parsearFecha(valor) !== null, { error: mensaje })
}

const camposPeriodo = {
  inicio: dia(MENSAJES_PERIODO.inicio),
  fin: dia(MENSAJES_PERIODO.fin),
}

/**
 * Periodo cerrado: inicio ≤ fin ≤ hoy. Los errores van al campo que se debe
 * corregir (el fin, en ambos casos).
 */
function conPeriodoCerrado<
  T extends z.ZodType<{ inicio: string; fin: string }>,
>(esquema: T, hoy: string) {
  return esquema.superRefine((valores, ctx) => {
    if (valores.fin < valores.inicio) {
      ctx.addIssue({
        code: "custom",
        path: ["fin"],
        message: MENSAJES_PERIODO.orden,
      })
    } else if (valores.fin > hoy) {
      ctx.addIssue({
        code: "custom",
        path: ["fin"],
        message: MENSAJES_PERIODO.abierto,
      })
    }
  })
}

/** «Generar corte»: todos los medios con verificadas hasta el fin del periodo. */
export function esquemaGenerarCorte(hoy: string) {
  return conPeriodoCerrado(z.object(camposPeriodo), hoy)
}

export type EntradaGenerarCorte = z.input<
  ReturnType<typeof esquemaGenerarCorte>
>

/** «Liquidar» un medio. */
export function esquemaGenerarLiquidacion(hoy: string) {
  return conPeriodoCerrado(z.object({ medioId: id, ...camposPeriodo }), hoy)
}

export type EntradaGenerarLiquidacion = z.input<
  ReturnType<typeof esquemaGenerarLiquidacion>
>

export const esquemaAprobar = z.object({
  liquidacionIds: z
    .array(id)
    .min(1, "Elige al menos una liquidación.")
    .max(
      MAXIMO_APROBACION,
      `Aprueba hasta ${MAXIMO_APROBACION} liquidaciones a la vez.`
    )
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "Hay liquidaciones repetidas en la selección.",
    }),
})

export type EntradaAprobar = z.input<typeof esquemaAprobar>

export const esquemaAnular = z.object({
  liquidacionId: id,
  motivo: z
    .string({ error: "Escribe el motivo." })
    .trim()
    .min(
      LONGITUD_MINIMA_MOTIVO,
      `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
    )
    .max(
      LONGITUD_MAXIMA_MOTIVO,
      `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`
    ),
})

export type EntradaAnular = z.input<typeof esquemaAnular>

// ── Factura del medio (LIQ-004, D83) ─────────────────────────────────────────

/** La factura del medio es un PDF (`soportes/liquidacion/{id}/factura/`). */
export const LIMITES_FACTURA_MEDIO: LimitesArchivo = {
  mimes: ["application/pdf"],
  maxBytes: BUCKETS.soportes.maxBytes,
}

/** Lo que admite `registrar_factura_medio_srv` (en mayúsculas): «FE-1234», «SETP 990001». */
export const numeroFactura = z
  .string({ error: "Escribe el número de la factura." })
  .trim()
  .min(1, "Escribe el número de la factura.")
  .max(60, "El número admite hasta 60 caracteres.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 -]*$/,
    "Usa letras, números, espacios o guiones, tal como aparece en la factura (p. ej. FE-1234)."
  )
  .transform((valor) => valor.toUpperCase())

/** El formulario: el número; el PDF se valida al elegirlo (`ZonaArchivos`). */
export const esquemaFormularioFactura = z.object({
  liquidacionId: id,
  numero: numeroFactura,
})

export type EntradaFormularioFactura = z.input<typeof esquemaFormularioFactura>

export const esquemaPrepararFactura = z.object({
  liquidacionId: id,
  archivo: esquemaDescripcionArchivo(LIMITES_FACTURA_MEDIO),
})

export type EntradaPrepararFactura = z.input<typeof esquemaPrepararFactura>

export const esquemaRegistrarFactura = esquemaFormularioFactura.extend({
  archivo: esquemaArchivoSubido(LIMITES_FACTURA_MEDIO),
})

export type EntradaRegistrarFactura = z.input<typeof esquemaRegistrarFactura>

// ── Descargas ────────────────────────────────────────────────────────────────

export const esquemaArchivoLiquidacion = z.object({
  liquidacionId: id,
  archivo: z.enum(["soporte_pago", "factura_medio"], {
    error: "Archivo desconocido.",
  }),
})

export type EntradaArchivoLiquidacion = z.input<
  typeof esquemaArchivoLiquidacion
>
