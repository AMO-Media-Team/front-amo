/**
 * Esquemas zod de «Mis documentos» (módulo puro): los MISMOS en el navegador y
 * en las Server Actions. El navegador nunca propone la ruta: declara el tipo
 * y el archivo; el servidor construye la carpeta `medio/{id}/{tipo}/` y, al
 * confirmar, comprueba que lo subido cae exactamente ahí.
 */
import { z } from "zod"

import {
  esquemaArchivoSubido,
  esquemaDescripcionArchivo,
  type LimitesArchivo,
} from "@/lib/archivos/esquemas"
import { Constants } from "@/types/database.types"

import { REGLAS_DOCUMENTO } from "./catalogo"

export const LIMITES_DOCUMENTO: LimitesArchivo = {
  mimes: REGLAS_DOCUMENTO.mimes,
  maxBytes: REGLAS_DOCUMENTO.maxBytes,
}

const tipo = z.enum(Constants.public.Enums.documento_medio_tipo, {
  error: "Ese tipo de documento no existe.",
})

/** `documentos_medio` no guarda miniatura: el navegador no debe pedirla. */
const sinMiniatura = { error: "Este documento no lleva miniatura." }

export const esquemaPrepararDocumento = z.object({
  tipo,
  archivo: esquemaDescripcionArchivo(LIMITES_DOCUMENTO).refine(
    (archivo) => !archivo.conMiniatura,
    sinMiniatura
  ),
})

export const esquemaConfirmarDocumento = z.object({
  tipo,
  archivo: esquemaArchivoSubido(LIMITES_DOCUMENTO).refine(
    (archivo) => archivo.rutaMiniatura === null,
    sinMiniatura
  ),
})

export const esquemaFirmarDocumento = z.object({
  documentoId: z.uuid({ error: "Identificador inválido." }),
  /** Firma como adjunto (`Content-Disposition`) para el botón «Descargar». */
  descargar: z.boolean().optional(),
})

export type EntradaPrepararDocumento = z.input<typeof esquemaPrepararDocumento>
export type EntradaConfirmarDocumento = z.input<
  typeof esquemaConfirmarDocumento
>
export type EntradaFirmarDocumento = z.input<typeof esquemaFirmarDocumento>
