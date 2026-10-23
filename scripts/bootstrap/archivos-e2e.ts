/**
 * Archivos de prueba listos para subir (módulo puro): nombre, MIME y
 * contenido, como los espera `setInputFiles` de Playwright, más las medidas
 * que declara un creativo (ancho, alto y duración). Los usan las utilidades
 * E2E (`e2e/utilidades/archivos.ts`) y las fábricas de ofertas
 * (`fabricas-negocio.ts`). Nada vive como binario en el repositorio: cada
 * archivo se genera en memoria y siempre igual para los mismos parámetros.
 */
import { createHash } from "node:crypto"

import {
  type ColorRgb,
  FONDO_MUESTRA,
  FRANJA_MUESTRA,
  pdfDeMuestra,
  pngDeMuestra,
} from "./archivos-prueba"
import { jpegDeMuestra } from "./jpeg-prueba"
import {
  CUADROS_POR_SEGUNDO,
  cuadrosDeVideo,
  mp4DeMuestra,
} from "./video-prueba"

export interface ArchivoPrueba {
  name: string
  mimeType: string
  buffer: Buffer
}

export interface MedidasArchivo {
  ancho: number
  alto: number
  /** Solo videos. */
  duracionSegundos: number | null
}

export type FormatoImagen = "png" | "jpeg"

export interface OpcionesImagen {
  ancho: number
  alto: number
  formato?: FormatoImagen
  /** Peso mínimo en bytes (p. ej. ~12 MB para probar archivos grandes). */
  bytesMinimos?: number
  nombre?: string
  fondo?: ColorRgb
  franja?: ColorRgb
}

export interface OpcionesVideoPrueba {
  ancho: number
  alto: number
  /** Duración en segundos (por omisión 3); se redondea a décimas. */
  segundos?: number
  nombre?: string
}

const MIME_IMAGEN: Record<FormatoImagen, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
}
const EXTENSION_IMAGEN: Record<FormatoImagen, string> = {
  png: "png",
  jpeg: "jpg",
}
const SEGUNDOS_POR_OMISION = 3

export function imagenPrueba({
  ancho,
  alto,
  formato = "png",
  bytesMinimos,
  nombre,
  fondo = FONDO_MUESTRA,
  franja = FRANJA_MUESTRA,
}: OpcionesImagen): ArchivoPrueba {
  const buffer =
    formato === "png"
      ? pngDeMuestra(ancho, alto, fondo, franja, { bytesMinimos })
      : jpegDeMuestra({ ancho, alto, fondo, franja, bytesMinimos })
  return {
    name: nombre ?? `muestra-${ancho}x${alto}.${EXTENSION_IMAGEN[formato]}`,
    mimeType: MIME_IMAGEN[formato],
    buffer,
  }
}

/** Duración real del video que genera `videoPrueba` para `segundos`. */
export function duracionVideo(segundos = SEGUNDOS_POR_OMISION): number {
  return cuadrosDeVideo(segundos) / CUADROS_POR_SEGUNDO
}

export function videoPrueba({
  ancho,
  alto,
  segundos = SEGUNDOS_POR_OMISION,
  nombre,
}: OpcionesVideoPrueba): ArchivoPrueba {
  return {
    name: nombre ?? `muestra-${ancho}x${alto}-${duracionVideo(segundos)}s.mp4`,
    mimeType: "video/mp4",
    buffer: mp4DeMuestra({
      ancho,
      alto,
      segundos,
      fondo: FONDO_MUESTRA,
      franja: FRANJA_MUESTRA,
    }),
  }
}

/** PDF de una página (documentos de la empresa: RUT, Cámara de Comercio…). */
export function pdfPrueba({
  titulo,
  nombre,
}: {
  titulo: string
  nombre?: string
}): ArchivoPrueba {
  return {
    name: nombre ?? `${slug(titulo) || "documento"}-prueba.pdf`,
    mimeType: "application/pdf",
    buffer: pdfDeMuestra([
      "AMO · Documento de muestra (pruebas E2E)",
      titulo,
      "Generado por las pruebas automatizadas. No es un documento real.",
    ]),
  }
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** SHA-256 en hexadecimal (la huella que guarda `creativo_archivos.sha256`). */
export function huellaSha256(contenido: Buffer | ArchivoPrueba): string {
  const datos = Buffer.isBuffer(contenido) ? contenido : contenido.buffer
  return createHash("sha256").update(datos).digest("hex")
}

/** «9:16» → 0,5625; «1.91:1» → 1,91 (como `private.relacion_aspecto`). */
export function relacionAspecto(texto: string): number {
  const [ancho, alto] = texto.split(":").map(Number)
  if (!(ancho > 0) || !(alto > 0)) {
    throw new RangeError(`Relación de aspecto inválida: «${texto}».`)
  }
  return ancho / alto
}

/**
 * Medidas con esa relación de aspecto y el lado mayor dado. Con `pares` (los
 * videos 4:2:0) el lado menor se lleva al par más cercano.
 */
export function medidasParaRelacion(
  relacion: string,
  ladoMayor: number,
  { pares = false }: { pares?: boolean } = {}
): { ancho: number; alto: number } {
  const r = relacionAspecto(relacion)
  const redondear = (valor: number) =>
    pares
      ? Math.max(2, Math.round(valor / 2) * 2)
      : Math.max(1, Math.round(valor))
  return r >= 1
    ? { ancho: ladoMayor, alto: redondear(ladoMayor / r) }
    : { ancho: redondear(ladoMayor * r), alto: ladoMayor }
}
