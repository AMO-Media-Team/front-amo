/**
 * Lectura de dimensiones y duración en el navegador (imagen con `<img>`,
 * video con `<video preload="metadata">`). No descarga nada: trabaja con un
 * `blob:` local que se revoca al terminar (la CSP permite `blob:` en
 * `img-src` y `media-src`).
 */
import { categoriaDe, mimeDeArchivo } from "./mime"
import type { Dimensiones } from "./tipos"

/** Un video que no entrega sus metadatos en este tiempo se da por ilegible. */
const ESPERA_METADATOS_MS = 15_000

interface MetadatosVideo extends Dimensiones {
  duracionSeg: number
}

async function conUrlLocal<T>(
  archivo: Blob,
  leer: (url: string) => Promise<T>
): Promise<T> {
  const url = URL.createObjectURL(archivo)
  try {
    return await leer(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function dimensionesImagen(url: string): Promise<Dimensiones> {
  const imagen = new Image()
  imagen.decoding = "async"
  imagen.src = url
  // `decode` respeta la orientación EXIF, igual que el <img> que la muestra.
  await imagen.decode()
  return { ancho: imagen.naturalWidth, alto: imagen.naturalHeight }
}

function metadatosVideo(url: string): Promise<MetadatosVideo> {
  return new Promise((resolver, rechazar) => {
    const video = document.createElement("video")
    const limpiar = () => {
      clearTimeout(espera)
      video.removeAttribute("src")
      video.load()
    }
    const espera = setTimeout(() => {
      limpiar()
      rechazar(new Error("El video no entregó sus metadatos a tiempo."))
    }, ESPERA_METADATOS_MS)
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      const metadatos = {
        ancho: video.videoWidth,
        alto: video.videoHeight,
        duracionSeg: video.duration,
      }
      limpiar()
      if (Number.isFinite(metadatos.duracionSeg)) resolver(metadatos)
      else rechazar(new Error("El video no informa su duración."))
    }
    video.onerror = () => {
      limpiar()
      rechazar(new Error("El navegador no pudo leer el video."))
    }
    video.src = url
  })
}

function categoriaDeBlob(archivo: Blob) {
  const nombre = archivo instanceof File ? archivo.name : ""
  return categoriaDe(mimeDeArchivo({ name: nombre, type: archivo.type }))
}

/** Ancho y alto en píxeles de una imagen o un video. */
export async function leerDimensiones(archivo: Blob): Promise<Dimensiones> {
  const categoria = categoriaDeBlob(archivo)
  if (categoria === "imagen") return conUrlLocal(archivo, dimensionesImagen)
  if (categoria === "video") {
    const { ancho, alto } = await conUrlLocal(archivo, metadatosVideo)
    return { ancho, alto }
  }
  throw new Error("Solo las imágenes y los videos tienen dimensiones.")
}

/** Duración en segundos (con decimales) de un video. */
export async function leerDuracionVideo(archivo: Blob): Promise<number> {
  const { duracionSeg } = await conUrlLocal(archivo, metadatosVideo)
  return duracionSeg
}

/** Primer cuadro útil de un video (a 1 s o a la mitad si es más corto). */
export function cuadroDeVideo(archivo: Blob): Promise<ImageBitmap> {
  return conUrlLocal(
    archivo,
    (url) =>
      new Promise<ImageBitmap>((resolver, rechazar) => {
        const video = document.createElement("video")
        const terminar = () => {
          clearTimeout(espera)
          video.removeAttribute("src")
          video.load()
        }
        const espera = setTimeout(() => {
          terminar()
          rechazar(new Error("El video no se pudo leer a tiempo."))
        }, ESPERA_METADATOS_MS)
        video.preload = "auto"
        video.muted = true
        video.playsInline = true
        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, video.duration / 2 || 0)
        }
        video.onseeked = () => {
          createImageBitmap(video).then(resolver, rechazar).finally(terminar)
        }
        video.onerror = () => {
          terminar()
          rechazar(new Error("El navegador no pudo leer el video."))
        }
        video.src = url
      })
  )
}
