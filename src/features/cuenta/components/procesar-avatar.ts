"use client"

import {
  type Dimensiones,
  type Encuadre,
  LADO_AVATAR,
  regionRecorte,
} from "../avatar"

/**
 * Recorte y compresión en el navegador (el plan free de Supabase no
 * transforma imágenes, §8). `browser-image-compression` se carga al usarla y
 * su worker se sirve desde `public/vendor` (la CSP no permite CDN).
 */

const RUTA_LIBRERIA = "/vendor/browser-image-compression.js"
const CALIDAD_WEBP = 0.9
const TAMANO_MAXIMO_MB = 0.4

export async function leerDimensiones(url: string): Promise<Dimensiones> {
  const imagen = new Image()
  imagen.decoding = "async"
  imagen.src = url
  await imagen.decode()
  return { ancho: imagen.naturalWidth, alto: imagen.naturalHeight }
}

async function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolver) =>
    canvas.toBlob(resolver, "image/webp", CALIDAD_WEBP)
  )
  if (!blob) throw new Error("No se pudo generar la imagen recortada.")
  return blob
}

/** Cuadrado de `LADO_AVATAR` px con el encuadre elegido, comprimido a WebP. */
export async function generarAvatar(
  archivo: File,
  encuadre: Encuadre,
  dimensiones: Dimensiones,
  ladoVisor: number
): Promise<File> {
  // `from-image` respeta la orientación EXIF, igual que el <img> del visor.
  const mapa = await createImageBitmap(archivo, {
    imageOrientation: "from-image",
  })
  const region = regionRecorte(encuadre, dimensiones, ladoVisor)
  const canvas = document.createElement("canvas")
  canvas.width = LADO_AVATAR
  canvas.height = LADO_AVATAR
  const contexto = canvas.getContext("2d")
  if (!contexto) throw new Error("El navegador no permite editar imágenes.")
  contexto.imageSmoothingQuality = "high"
  contexto.drawImage(
    mapa,
    region.x,
    region.y,
    region.lado,
    region.lado,
    0,
    0,
    LADO_AVATAR,
    LADO_AVATAR
  )
  mapa.close()

  const recortada = await aBlob(canvas)
  const { default: comprimir } = await import("browser-image-compression")
  return comprimir(
    new File([recortada], "avatar.webp", { type: recortada.type }),
    {
      maxSizeMB: TAMANO_MAXIMO_MB,
      maxWidthOrHeight: LADO_AVATAR,
      fileType: "image/webp",
      initialQuality: CALIDAD_WEBP,
      useWebWorker: true,
      // Absoluta: el worker nace de un `blob:` y ahí una ruta relativa no resuelve.
      libURL: new URL(RUTA_LIBRERIA, window.location.origin).href,
    }
  )
}
