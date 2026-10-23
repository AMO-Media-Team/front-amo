/**
 * Entradas de las acciones de verificación de anunciantes (módulo puro): los
 * MISMOS esquemas en el cliente y en las Server Actions. Reflejan los CHECK de
 * la BD (`anunciantes.motivo_estado` ≤ 500, `documentos_anunciante.observaciones`
 * ≤ 1000), que vuelve a validarlo todo. Para cargar un documento el navegador
 * declara el tipo y el archivo; la ruta la construye el servidor.
 */
import { z } from "zod"

import { esDiaValido } from "@/features/verificacion/vigencia"
import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { Constants } from "@/types/database.types"

import { REGLAS_DOCUMENTO } from "./reglas"

export const LIMITES_VERIFICACION_ANUNCIANTE = {
  motivoMin: 5,
  /** `anunciantes.motivo_estado` ≤ 500; el motivo de un documento, también. */
  motivoMax: 500,
  observacionesMax: 1000,
} as const

const { motivoMin, motivoMax, observacionesMax } =
  LIMITES_VERIFICACION_ANUNCIANTE

const id = z.uuid({ error: "Identificador inválido." })

const motivo = z
  .string({ error: "Escribe el motivo." })
  .trim()
  .min(motivoMin, `Describe el motivo (al menos ${motivoMin} caracteres).`)
  .max(motivoMax, `Máximo ${motivoMax} caracteres.`)

const tipo = z.enum(Constants.public.Enums.documento_anunciante_tipo, {
  error: "Elige el tipo de documento.",
})

// ── Documentos ───────────────────────────────────────────────────────────────

export const esquemaDocumentoAnunciante = z.object({ documentoId: id })
export type EntradaDocumentoAnunciante = z.input<
  typeof esquemaDocumentoAnunciante
>

export const esquemaAprobarDocumentoAnunciante = z.object({
  documentoId: id,
  /** `YYYY-MM-DD`; vacío = sin vencimiento. Que no sea pasada lo revisa el servidor con su «hoy». */
  fechaVencimiento: z
    .string()
    .trim()
    .refine((valor) => valor === "" || esDiaValido(valor), {
      error: "Escribe una fecha válida.",
    })
    .transform((valor) => valor || null)
    .optional()
    .transform((valor) => valor ?? null),
  observaciones: z
    .string()
    .trim()
    .max(
      observacionesMax,
      `Máximo ${observacionesMax.toLocaleString("es-CO")} caracteres.`
    )
    .transform((valor) => valor || null)
    .optional()
    .transform((valor) => valor ?? null),
})
export type EntradaAprobarDocumentoAnunciante = z.input<
  typeof esquemaAprobarDocumentoAnunciante
>

export const esquemaRechazarDocumentoAnunciante = z.object({
  documentoId: id,
  motivo,
})
export type EntradaRechazarDocumentoAnunciante = z.input<
  typeof esquemaRechazarDocumentoAnunciante
>

// ── Decisión sobre la empresa ────────────────────────────────────────────────

export const esquemaAnunciante = z.object({ anuncianteId: id })
export type EntradaAnunciante = z.input<typeof esquemaAnunciante>

/** Rechazar, suspender y reactivar: siempre con el motivo que recibe la empresa. */
export const esquemaMotivoAnunciante = z.object({ anuncianteId: id, motivo })
export type EntradaMotivoAnunciante = z.input<typeof esquemaMotivoAnunciante>

// ── Carga por cuenta de la empresa ───────────────────────────────────────────

export const LIMITES_DOCUMENTO: LimitesArchivo = {
  mimes: REGLAS_DOCUMENTO.mimes,
  maxBytes: REGLAS_DOCUMENTO.maxBytes,
}

/** `documentos_anunciante` no guarda miniatura: el navegador no debe pedirla. */
const sinMiniatura = { error: "Este documento no lleva miniatura." }

export const esquemaPrepararCarga = z.object({
  anuncianteId: id,
  tipo,
  archivo: esquemaDescripcionArchivo(LIMITES_DOCUMENTO).refine(
    (archivo) => !archivo.conMiniatura,
    sinMiniatura
  ),
})
export type EntradaPrepararCarga = z.input<typeof esquemaPrepararCarga>

export const esquemaConfirmarCarga = z.object({
  anuncianteId: id,
  tipo,
  archivo: esquemaArchivoSubido(LIMITES_DOCUMENTO).refine(
    (archivo) => archivo.rutaMiniatura === null,
    sinMiniatura
  ),
})
export type EntradaConfirmarCarga = z.input<typeof esquemaConfirmarCarga>
