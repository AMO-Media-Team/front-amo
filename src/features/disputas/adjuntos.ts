/**
 * Adjuntos del hilo de una disputa (módulo puro): qué se admite (imagen o PDF
 * de hasta 10 MB en `evidencias/disputa/{id}/…`, la carpeta `interno/` para
 * las notas del equipo) y cómo se presenta un adjunto sin revelar su ruta.
 */
import { BUCKETS } from "@/lib/archivos/buckets"
import type { LimitesArchivo } from "@/lib/archivos/esquemas"
import { MIB } from "@/lib/archivos/formato"
import type { ReglasArchivo } from "@/lib/archivos/validar"
import { formatearFecha } from "@/lib/format"

import type { AdjuntoMensaje } from "./tipos"

/** Lo que admite el bucket `evidencias` para una disputa. */
export const MIMES_ADJUNTO = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const

export const LIMITES_ADJUNTO: LimitesArchivo = {
  mimes: MIMES_ADJUNTO,
  maxBytes: BUCKETS.evidencias.maxBytes,
}

/** El archivo final (las fotos ya comprimidas a WebP en el dispositivo). */
export const REGLAS_ADJUNTO: ReglasArchivo = LIMITES_ADJUNTO

/**
 * Al elegir: una foto del celular puede pesar más de 10 MB o ser HEIC y se
 * reduce antes de subirla; el límite real se aplica después de comprimir.
 */
export const REGLAS_SELECCION_ADJUNTO: ReglasArchivo = {
  mimes: [...MIMES_ADJUNTO, "image/heic"],
  maxBytes: 40 * MIB,
}

const MIME_POR_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
}

/** MIME del adjunto según la extensión de su ruta (`application/octet-stream` si no se reconoce). */
export function mimeDeRuta(ruta: string): string {
  const extension = ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase()
  return MIME_POR_EXTENSION[extension] ?? "application/octet-stream"
}

/**
 * Lo que la interfaz sabe de un adjunto: su tipo y un nombre legible con la
 * fecha del mensaje («Adjunto del 23 oct 2026.pdf»). El nombre original no se
 * guarda; la ruta se queda en el servidor.
 */
export function describirAdjunto(
  ruta: string | null,
  creadoAt: string
): AdjuntoMensaje | null {
  if (!ruta) return null
  const tipo = mimeDeRuta(ruta)
  const extension = ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase()
  const fecha = formatearFecha(creadoAt).replaceAll(".", "")
  return { tipo, nombre: `Adjunto del ${fecha}.${extension}` }
}

/** «Imagen adjunta» o «PDF adjunto», para el botón que lo abre. */
export function etiquetaAdjunto(adjunto: AdjuntoMensaje): string {
  return adjunto.tipo === "application/pdf" ? "PDF adjunto" : "Imagen adjunta"
}
