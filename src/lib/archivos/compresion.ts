/**
 * Compresión y miniaturas en el navegador: el plan free de Supabase no
 * transforma imágenes (docs/modelo-datos.md §8). `browser-image-compression`
 * se carga solo al usarla y su worker sale de `public/vendor` (la CSP no
 * permite CDN), como en `features/cuenta/components/procesar-avatar.ts`.
 * Los creativos originales NO se recomprimen (§12): esto es para capturas,
 * documentos fotografiados y miniaturas.
 */
import { cuadroDeVideo } from "./medios"
import {
  categoriaDe,
  esMimeConocido,
  extensionDeMime,
  mimeDeArchivo,
  nombreConExtension,
} from "./mime"

const RUTA_LIBRERIA = "/vendor/browser-image-compression.js"

/** Lado máximo de las miniaturas (`miniatura_path`, §8). */
export const LADO_MINIATURA = 320
const CALIDAD_MINIATURA = 0.75

export interface OpcionesCompresion {
  /** Lado mayor en píxeles (no amplía imágenes más pequeñas). */
  maxLado: number
  /** 0–1 (WebP/JPEG). */
  calidad: number
  /** Peso objetivo; si se omite, solo se redimensiona y recodifica. */
  maxBytes?: number
  senal?: AbortSignal
}

/** Capturas de evidencia y documentos fotografiados: ≤ 1600 px, WebP (§8). */
export const COMPRESION_CAPTURA: OpcionesCompresion = {
  maxLado: 1600,
  calidad: 0.85,
}

type Formato = "image/webp" | "image/jpeg"

/** Los GIF animados perderían la animación: se suben tal cual. */
const COMPRIMIBLES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
])

function esAborto(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

async function codificar(
  archivo: File,
  formato: Formato,
  opciones: OpcionesCompresion
): Promise<Blob> {
  const { default: comprimir } = await import("browser-image-compression")
  return comprimir(archivo, {
    maxWidthOrHeight: opciones.maxLado,
    maxSizeMB: opciones.maxBytes
      ? opciones.maxBytes / (1024 * 1024)
      : Number.POSITIVE_INFINITY,
    fileType: formato,
    initialQuality: opciones.calidad,
    useWebWorker: true,
    signal: opciones.senal,
    // Absoluta: el worker nace de un `blob:` y ahí una ruta relativa no resuelve.
    libURL: new URL(RUTA_LIBRERIA, window.location.origin).href,
  })
}

function comoArchivo(blob: Blob, nombreOriginal: string): File {
  const extension = esMimeConocido(blob.type)
    ? extensionDeMime(blob.type)
    : "bin"
  return new File([blob], nombreConExtension(nombreOriginal, extension), {
    type: blob.type,
    lastModified: Date.now(),
  })
}

/**
 * WebP y, si el navegador no lo codifica en `<canvas>` (Safari entrega PNG),
 * JPEG, que sí pesa poco.
 */
async function recodificar(
  archivo: File,
  opciones: OpcionesCompresion
): Promise<File> {
  const webp = await codificar(archivo, "image/webp", opciones)
  if (webp.type === "image/webp") return comoArchivo(webp, archivo.name)
  return comoArchivo(
    await codificar(archivo, "image/jpeg", opciones),
    archivo.name
  )
}

/**
 * Redimensiona y recodifica una imagen a WebP (o JPEG en Safari). Un GIF, un
 * archivo que no es imagen o una imagen que este navegador no puede decodificar
 * (HEIC fuera de Safari) se devuelve tal cual: la validación de peso decide.
 */
export async function comprimirImagen(
  archivo: File,
  opciones: OpcionesCompresion
): Promise<File> {
  if (!COMPRIMIBLES.has(mimeDeArchivo(archivo))) return archivo
  try {
    return await recodificar(archivo, opciones)
  } catch (error) {
    if (esAborto(error)) throw error
    return archivo
  }
}

function lienzoABlob(
  lienzo: HTMLCanvasElement,
  formato: Formato
): Promise<Blob | null> {
  return new Promise((resolver) =>
    lienzo.toBlob(resolver, formato, CALIDAD_MINIATURA)
  )
}

async function miniaturaDeVideo(archivo: File): Promise<File> {
  const cuadro = await cuadroDeVideo(archivo)
  const escala = Math.min(
    1,
    LADO_MINIATURA / Math.max(cuadro.width, cuadro.height)
  )
  const lienzo = document.createElement("canvas")
  lienzo.width = Math.max(1, Math.round(cuadro.width * escala))
  lienzo.height = Math.max(1, Math.round(cuadro.height * escala))
  const contexto = lienzo.getContext("2d")
  if (!contexto) {
    cuadro.close()
    throw new Error("El navegador no permite generar la miniatura.")
  }
  contexto.imageSmoothingQuality = "high"
  contexto.drawImage(cuadro, 0, 0, lienzo.width, lienzo.height)
  cuadro.close()
  const webp = await lienzoABlob(lienzo, "image/webp")
  const blob =
    webp?.type === "image/webp" ? webp : await lienzoABlob(lienzo, "image/jpeg")
  if (!blob) throw new Error("No se pudo generar la miniatura del video.")
  return comoArchivo(blob, archivo.name)
}

/**
 * Miniatura de hasta 320 px de una imagen (de un GIF, su primer cuadro) o del
 * cuadro de un video al primer segundo. Para listas y vistas previas.
 */
export async function generarMiniatura(
  archivo: File,
  senal?: AbortSignal
): Promise<File> {
  const categoria = categoriaDe(mimeDeArchivo(archivo))
  if (categoria === "video") return miniaturaDeVideo(archivo)
  if (categoria !== "imagen") {
    throw new Error("Solo las imágenes y los videos tienen miniatura.")
  }
  return recodificar(archivo, {
    maxLado: LADO_MINIATURA,
    calidad: CALIDAD_MINIATURA,
    senal,
  })
}
