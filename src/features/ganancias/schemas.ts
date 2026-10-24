/**
 * Entradas de «Ganancias» (módulo puro): los MISMOS esquemas en el navegador
 * y en las Server Actions. El número de la factura sigue la regla de
 * `registrar_factura_medio_srv` (mayúsculas, letras, números, espacios y
 * guiones, hasta 60), que lo vuelve a validar.
 */
import { z } from "zod"

import { BUCKETS } from "@/lib/archivos/buckets"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import type { ReglasArchivo } from "@/lib/archivos/validar"

const id = z.uuid({ error: "Identificador inválido." })

/** Largo máximo de `storage.objects.name`. */
const LARGO_MAXIMO_RUTA = 1024

export const LARGO_MAXIMO_NUMERO_FACTURA = 60

/** Lo que exige la BD (`upper(btrim(numero)) ~ '^[A-Z0-9][A-Z0-9 -]{0,59}$'`). */
const PATRON_NUMERO_FACTURA = /^[A-Z0-9][A-Z0-9 -]*$/

// ── Lectura ──────────────────────────────────────────────────────────────────

export const esquemaPaginaPagos = z.object({ antesId: id })
export type EntradaPaginaPagos = z.input<typeof esquemaPaginaPagos>

export const ARCHIVOS_LIQUIDACION = [
  "soporte_pago",
  "documento_soporte",
  "factura",
] as const

export const esquemaFirmarArchivo = z.object({
  liquidacionId: id,
  archivo: z.enum(ARCHIVOS_LIQUIDACION),
})
export type EntradaFirmarArchivo = z.input<typeof esquemaFirmarArchivo>

// ── Factura del medio (D83) ──────────────────────────────────────────────────

/** Solo PDF, hasta 10 MB (el bucket `soportes`). */
export const LIMITES_FACTURA: LimitesArchivo = {
  mimes: ["application/pdf"],
  maxBytes: BUCKETS.soportes.maxBytes,
}

export const REGLAS_FACTURA: ReglasArchivo = LIMITES_FACTURA

export const esquemaNumeroFactura = z
  .string({ error: "Escribe el número de tu factura." })
  .trim()
  .toUpperCase()
  .min(1, "Escribe el número de tu factura.")
  .max(
    LARGO_MAXIMO_NUMERO_FACTURA,
    `El número admite hasta ${LARGO_MAXIMO_NUMERO_FACTURA} caracteres.`
  )
  .regex(
    PATRON_NUMERO_FACTURA,
    "Usa solo letras, números, espacios y guiones, como aparece en tu factura (por ejemplo, FE-1234)."
  )

/** Lo que valida el formulario antes de subir nada. */
export const esquemaFormularioFactura = z.object({
  liquidacionId: id,
  numero: esquemaNumeroFactura,
})
export type EntradaFormularioFactura = z.input<typeof esquemaFormularioFactura>

export const esquemaPrepararFactura = z.object({
  liquidacionId: id,
  descripcion: esquemaDescripcionArchivo(LIMITES_FACTURA),
})
export type EntradaPrepararFactura = z.input<typeof esquemaPrepararFactura>

export const esquemaConfirmarFactura = z.object({
  liquidacionId: id,
  archivo: esquemaArchivoSubido(LIMITES_FACTURA),
})
export type EntradaConfirmarFactura = z.input<typeof esquemaConfirmarFactura>

export const esquemaRegistrarFactura = esquemaFormularioFactura.extend({
  /** Ruta que devolvió la subida (el servidor comprueba que es de su carpeta). */
  archivoPath: z
    .string({ error: "Adjunta el PDF de tu factura." })
    .min(1, "Adjunta el PDF de tu factura.")
    .max(LARGO_MAXIMO_RUTA),
})
export type EntradaRegistrarFactura = z.input<typeof esquemaRegistrarFactura>
