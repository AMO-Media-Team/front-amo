/**
 * Esquemas zod de «Mi empresa › Documentos» (módulo puro): los MISMOS en el
 * navegador y en las Server Actions. El navegador nunca propone la ruta:
 * declara el tipo y el archivo; el servidor construye la carpeta
 * `anunciante/{id}/{tipo}/` y, al confirmar, comprueba que lo subido cae
 * exactamente ahí.
 */
import { z } from "zod"

import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { Constants } from "@/types/database.types"

import { REGLAS_DOCUMENTO_ANUNCIANTE } from "./catalogo"

export const LIMITES_DOCUMENTO_ANUNCIANTE: LimitesArchivo = {
  mimes: REGLAS_DOCUMENTO_ANUNCIANTE.mimes,
  maxBytes: REGLAS_DOCUMENTO_ANUNCIANTE.maxBytes,
}

const tipo = z.enum(Constants.public.Enums.documento_anunciante_tipo, {
  error: "Ese tipo de documento no existe.",
})

/** `documentos_anunciante` no guarda miniatura: el navegador no debe pedirla. */
const sinMiniatura = { error: "Este documento no lleva miniatura." }

export const esquemaPrepararDocumentoAnunciante = z.object({
  tipo,
  archivo: esquemaDescripcionArchivo(LIMITES_DOCUMENTO_ANUNCIANTE).refine(
    (archivo) => !archivo.conMiniatura,
    sinMiniatura
  ),
})

export const esquemaConfirmarDocumentoAnunciante = z.object({
  tipo,
  archivo: esquemaArchivoSubido(LIMITES_DOCUMENTO_ANUNCIANTE).refine(
    (archivo) => archivo.rutaMiniatura === null,
    sinMiniatura
  ),
})

export const esquemaFirmarDocumentoAnunciante = z.object({
  documentoId: z.uuid({ error: "Identificador inválido." }),
  /** Firma como adjunto (`Content-Disposition`) para el botón «Descargar». */
  descargar: z.boolean().optional(),
})

export type EntradaPrepararDocumentoAnunciante = z.input<
  typeof esquemaPrepararDocumentoAnunciante
>
export type EntradaConfirmarDocumentoAnunciante = z.input<
  typeof esquemaConfirmarDocumentoAnunciante
>
export type EntradaFirmarDocumentoAnunciante = z.input<
  typeof esquemaFirmarDocumentoAnunciante
>
