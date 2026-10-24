/**
 * Entradas del documento soporte (módulo puro): los MISMOS esquemas en los diálogos (cliente) y en las
 * Server Actions. Lo que escribe la persona se normaliza igual que en la BD (CUDS en minúsculas y sin
 * espacios, prefijo y número de la nota en mayúsculas) para que el error aparezca junto a su campo antes
 * de llamar al servidor; la BD vuelve a validarlo todo.
 */
import { z } from "zod"

import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { parsearFecha, serializarFecha } from "@/lib/fechas"
import {
  LONGITUD_MAXIMA_MOTIVO,
  LONGITUD_MINIMA_MOTIVO,
} from "@/features/usuarios/schemas"

const id = z.uuid({ error: "Identificador inválido." })

/** El CUDS que entrega el proveedor tecnológico: 96 caracteres hexadecimales. */
export const LARGO_CUDS = 96
export const LARGO_MAXIMO_CUDE = 200
export const LARGO_MAXIMO_NUMERO_NOTA = 60

export const MENSAJES_CAMPOS = {
  cudsVacio: "Pega el CUDS que te entregó el proveedor tecnológico.",
  cudsCaracteres:
    "El CUDS solo lleva números del 0 al 9 y letras de la a a la f.",
  prefijo:
    "El prefijo tiene hasta 4 letras o números, como en la resolución (déjalo vacío si no tiene).",
  consecutivoVacio: "Escribe el número que asignó el proveedor.",
  consecutivo: "Escribe solo el número, sin el prefijo.",
  fechaVacia: "Indica la fecha de emisión.",
  fechaFutura: "La fecha de emisión no puede ser posterior a hoy.",
  numeroNotaVacio: "Escribe el número de la nota de ajuste.",
  numeroNota:
    "El número de la nota lleva letras, números, espacios o guiones (hasta 60).",
  cude: `El CUDE tiene hasta ${LARGO_MAXIMO_CUDE} caracteres.`,
  archivoRequerido: "Carga el PDF.",
} as const

/** Quita espacios y saltos de línea (se pega desde un correo o un PDF) y pasa a minúsculas. */
export function normalizarCuds(texto: string): string {
  return texto.replace(/\s+/g, "").toLowerCase()
}

export function mensajeLargoCuds(largo: number): string {
  return `El CUDS tiene ${LARGO_CUDS} caracteres; el que pegaste tiene ${largo}.`
}

/** `null` si el CUDS (ya normalizado) es válido; si no, por qué. */
export function problemaCuds(cuds: string): string | null {
  if (cuds.length === 0) return MENSAJES_CAMPOS.cudsVacio
  if (!/^[0-9a-f]*$/.test(cuds)) return MENSAJES_CAMPOS.cudsCaracteres
  if (cuds.length !== LARGO_CUDS) return mensajeLargoCuds(cuds.length)
  return null
}

export const esquemaCuds = z
  .string({ error: MENSAJES_CAMPOS.cudsVacio })
  .transform(normalizarCuds)
  .superRefine((cuds, contexto) => {
    const problema = problemaCuds(cuds)
    if (problema) contexto.addIssue({ code: "custom", message: problema })
  })

const prefijo = z
  .string({ error: MENSAJES_CAMPOS.prefijo })
  .transform((texto) => texto.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{0,4}$/, MENSAJES_CAMPOS.prefijo))

const consecutivo = z
  .string({ error: MENSAJES_CAMPOS.consecutivoVacio })
  .trim()
  .min(1, { message: MENSAJES_CAMPOS.consecutivoVacio, abort: true })
  .regex(/^\d{1,15}$/, MENSAJES_CAMPOS.consecutivo)
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .positive(MENSAJES_CAMPOS.consecutivo)
      .max(Number.MAX_SAFE_INTEGER)
  )

/** `AAAA-MM-DD` (campo `date`) que no pasa de hoy en Bogotá. */
const fechaEmision = z
  .string({ error: MENSAJES_CAMPOS.fechaVacia })
  .trim()
  .min(1, { message: MENSAJES_CAMPOS.fechaVacia, abort: true })
  .refine((texto) => parsearFecha(texto) !== null, {
    message: MENSAJES_CAMPOS.fechaVacia,
    abort: true,
  })
  .refine(
    (texto) => texto <= serializarFecha(new Date()),
    MENSAJES_CAMPOS.fechaFutura
  )

const numeroNota = z
  .string({ error: MENSAJES_CAMPOS.numeroNotaVacio })
  .transform((texto) => texto.trim().replace(/\s+/g, " ").toUpperCase())
  .pipe(
    z
      .string()
      .min(1, { message: MENSAJES_CAMPOS.numeroNotaVacio, abort: true })
      .regex(/^[A-Z0-9][A-Z0-9 -]{0,59}$/, MENSAJES_CAMPOS.numeroNota)
  )

/** Opcional: vacío → `null`. */
const cude = z
  .string()
  .transform((texto) => texto.replace(/\s+/g, ""))
  .pipe(z.string().max(LARGO_MAXIMO_CUDE, MENSAJES_CAMPOS.cude))
  .transform((texto) => (texto ? texto.toLowerCase() : null))

const motivo = z
  .string({ error: "Escribe el motivo." })
  .trim()
  .min(
    LONGITUD_MINIMA_MOTIVO,
    `Describe el motivo (al menos ${LONGITUD_MINIMA_MOTIVO} caracteres).`
  )
  .max(LONGITUD_MAXIMA_MOTIVO, `Máximo ${LONGITUD_MAXIMA_MOTIVO} caracteres.`)

const archivoPath = z
  .string({ error: MENSAJES_CAMPOS.archivoRequerido })
  .min(1, MENSAJES_CAMPOS.archivoRequerido)
  .max(1024)

// ── Esquemas de las acciones ─────────────────────────────────────────────────

export const esquemaLiquidacion = z.object({ liquidacionId: id })
export type EntradaLiquidacion = z.input<typeof esquemaLiquidacion>

export const esquemaDocumento = z.object({ documentoId: id })
export type EntradaDocumento = z.input<typeof esquemaDocumento>

export const esquemaRegistrarCuds = z.object({
  documentoId: id,
  cuds: esquemaCuds,
})
export type EntradaRegistrarCuds = z.input<typeof esquemaRegistrarCuds>

/** Lo que se escribe en «Registrar documento expedido» (el PDF va aparte). */
export const esquemaCamposExpedido = z.object({
  prefijo,
  consecutivo,
  fechaEmision,
  cuds: esquemaCuds,
})
export type ValoresExpedido = z.input<typeof esquemaCamposExpedido>

export const esquemaRegistrarExpedido = esquemaCamposExpedido.extend({
  documentoId: id,
  archivoPath,
})
export type EntradaRegistrarExpedido = z.input<typeof esquemaRegistrarExpedido>

/** Lo que se escribe en «Registrar nota de ajuste» (el PDF va aparte). */
export const esquemaCamposNotaAjuste = z.object({ numero: numeroNota, cude })
export type ValoresNotaAjuste = z.input<typeof esquemaCamposNotaAjuste>

export const esquemaRegistrarNotaAjuste = esquemaCamposNotaAjuste.extend({
  documentoId: id,
  archivoPath,
})
export type EntradaRegistrarNotaAjuste = z.input<
  typeof esquemaRegistrarNotaAjuste
>

export const esquemaAnularDocumento = z.object({ documentoId: id, motivo })
export type EntradaAnularDocumento = z.input<typeof esquemaAnularDocumento>

export const ARCHIVOS_DOCUMENTO = ["pdf", "proveedor", "nota_ajuste"] as const
export type ArchivoDocumento = (typeof ARCHIVOS_DOCUMENTO)[number]

export const esquemaFirmarArchivo = z.object({
  documentoId: id,
  archivo: z.enum(ARCHIVOS_DOCUMENTO),
})
export type EntradaFirmarArchivo = z.input<typeof esquemaFirmarArchivo>

// ── PDF que sube la persona (documento del proveedor o nota de ajuste) ───────

/** Solo PDF, con el límite del bucket `soportes`. */
export const LIMITES_PDF: LimitesArchivo = {
  mimes: ["application/pdf"],
  maxBytes: BUCKETS.soportes.maxBytes,
}

/** `expedido`: el PDF del documento que numeró el proveedor; `nota_ajuste`: el de su nota. */
export const USOS_PDF = ["expedido", "nota_ajuste"] as const
export type UsoPdf = (typeof USOS_PDF)[number]

export const esquemaPrepararPdf = z.object({
  liquidacionId: id,
  uso: z.enum(USOS_PDF),
  archivo: esquemaDescripcionArchivo(LIMITES_PDF),
})
export type EntradaPrepararPdf = z.input<typeof esquemaPrepararPdf>

export const esquemaConfirmarPdf = z.object({
  liquidacionId: id,
  uso: z.enum(USOS_PDF),
  archivo: esquemaArchivoSubido(LIMITES_PDF),
})
export type EntradaConfirmarPdf = z.input<typeof esquemaConfirmarPdf>
