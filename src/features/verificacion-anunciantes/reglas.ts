/**
 * Archivos que admite la carga de un documento por cuenta de la empresa
 * (módulo puro): lo mismo que el bucket privado `documentos` (PDF o foto de
 * hasta 10 MB, comprobado sobre el archivo final). Al elegir se admite más:
 * una foto del celular se reduce en el dispositivo antes de subirla.
 */
import { BUCKETS } from "@/lib/archivos/buckets"
import { MIB } from "@/lib/archivos/formato"
import type { ReglasArchivo } from "@/lib/archivos/validar"

export const REGLAS_DOCUMENTO: ReglasArchivo = {
  mimes: BUCKETS.documentos.mimes,
  maxBytes: BUCKETS.documentos.maxBytes,
}

export const REGLAS_SELECCION: ReglasArchivo = {
  mimes: BUCKETS.documentos.mimes,
  maxBytes: 40 * MIB,
}

export const AYUDA_FORMATOS =
  "PDF o foto (JPG, PNG, WebP o HEIC) de hasta 10 MB. Las fotos se reducen solas antes de subir."
