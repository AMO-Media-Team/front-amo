/**
 * Archivos de prueba en memoria (sin binarios en el repositorio), listos para
 * `setInputFiles`: imágenes PNG o JPEG de las medidas pedidas (también de
 * ~12 MB), videos MP4 H.264 de la relación y duración pedidas y PDF de una
 * página. Los genera `scripts/bootstrap/archivos-e2e.ts`; el Chromium de
 * Playwright lee sus medidas y su duración como las de un archivo real
 * (`pnpm exec tsx scripts/bootstrap/comprobar-archivos-prueba.ts`).
 *
 * Cada archivo es siempre igual para los mismos parámetros: su SHA-256
 * (`huellaSha256`) es la que debe guardar la plataforma.
 */
import {
  type ArchivoPrueba,
  duracionVideo,
  huellaSha256,
  imagenPrueba,
  medidasParaRelacion,
  pdfPrueba,
  videoPrueba,
} from "../../scripts/bootstrap/archivos-e2e"

export type { ArchivoPrueba }
export { duracionVideo, huellaSha256, medidasParaRelacion }

/** 1 MiB: `bytesMinimos: 12 * MIB` para la imagen «de unos 12 MB». */
export const MIB = 1024 * 1024

export async function imagenDePrueba(opciones: {
  ancho: number
  alto: number
  formato?: "png" | "jpeg"
  /** Para probar archivos pesados (p. ej. ~12 MB). */
  bytesMinimos?: number
  /** Nombre del archivo (por omisión `muestra-<ancho>x<alto>.<ext>`). */
  nombre?: string
}): Promise<ArchivoPrueba> {
  return imagenPrueba(opciones)
}

/**
 * MP4 (H.264) de `segundos` (3 por omisión, en décimas). El ancho y el alto
 * deben ser pares: 1080 × 1920 o 360 × 640 (9:16), 1920 × 1080 o 640 × 360
 * (16:9). Pesa ~384 bytes por cada 16 × 16 píxeles (360 × 640 ≈ 0,35 MB;
 * 1080 × 1920 ≈ 3 MB) casi sin importar la duración.
 */
export async function videoDePrueba(opciones: {
  ancho: number
  alto: number
  segundos?: number
  nombre?: string
}): Promise<ArchivoPrueba> {
  return videoPrueba(opciones)
}

/** PDF de una página con `titulo` (RUT, Cámara de Comercio…). */
export async function pdfDePrueba(opciones: {
  titulo: string
  nombre?: string
}): Promise<ArchivoPrueba> {
  return pdfPrueba(opciones)
}
