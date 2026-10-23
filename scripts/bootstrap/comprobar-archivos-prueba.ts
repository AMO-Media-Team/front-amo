/**
 * `pnpm exec tsx scripts/bootstrap/comprobar-archivos-prueba.ts`
 *
 * Comprueba en el Chromium de Playwright que los archivos de prueba
 * (`archivos-e2e.ts`) se leen como los de verdad: cada imagen con sus medidas
 * (`createImageBitmap`) y cada video MP4 con su `videoWidth`, `videoHeight` y
 * `duration`, decodificando el primer y el último cuadro (y el color de la
 * franja y del fondo). Es lo que hace el navegador del anunciante antes de
 * subir un creativo. No levanta la app ni toca la base de datos; córrelo tras
 * actualizar Playwright o cambiar los generadores. Sale con código 1 si algo
 * no coincide.
 */
import { chromium, type Page } from "@playwright/test"

import { type ArchivoPrueba, imagenPrueba, videoPrueba } from "./archivos-e2e"
import { FONDO_MUESTRA, FRANJA_MUESTRA } from "./archivos-prueba"

const MIB = 1024 * 1024
/** Diferencia máxima por canal tras convertir RGB → YCbCr → RGB. */
const TOLERANCIA_COLOR = 6

interface Caso {
  archivo: ArchivoPrueba
  ancho: number
  alto: number
  /** Solo videos. */
  segundos?: number
  bytesMinimos?: number
}

interface Lectura {
  ancho: number
  alto: number
  duracion: number | null
  /** RGB en (2, 2) y en (2, alto − 3): franja arriba, fondo abajo. */
  arriba: number[]
  abajo: number[]
  /** El último cuadro también se decodificó (solo videos). */
  finalDecodificado: boolean | null
  error?: string
}

/** Se ejecuta en la página: lee el archivo como lo haría la app. */
async function leerEnNavegador(datos: {
  base64: string
  mime: string
  esVideo: boolean
}): Promise<Lectura> {
  const bytes = Uint8Array.from(atob(datos.base64), (c) => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: datos.mime })
  const pixel = (
    fuente: CanvasImageSource,
    ancho: number,
    alto: number,
    y: number
  ) => {
    const lienzo = new OffscreenCanvas(ancho, alto)
    const contexto = lienzo.getContext("2d")
    if (!contexto) throw new Error("Sin contexto 2D")
    contexto.drawImage(fuente, 0, 0)
    return Array.from(contexto.getImageData(2, y, 1, 1).data.slice(0, 3))
  }
  try {
    if (!datos.esVideo) {
      const imagen = await createImageBitmap(blob)
      return {
        ancho: imagen.width,
        alto: imagen.height,
        duracion: null,
        arriba: pixel(imagen, imagen.width, imagen.height, 2),
        abajo: pixel(imagen, imagen.width, imagen.height, imagen.height - 3),
        finalDecodificado: null,
      }
    }
    const video = document.createElement("video")
    video.muted = true
    video.preload = "auto"
    const url = URL.createObjectURL(blob)
    const esperar = (evento: string) =>
      new Promise<void>((resolver, rechazar) => {
        video.addEventListener(evento, () => resolver(), { once: true })
        video.addEventListener(
          "error",
          () => rechazar(new Error(video.error?.message || "error de medio")),
          { once: true }
        )
      })
    const datosListos = esperar("loadeddata")
    video.src = url
    await datosListos
    const lectura = {
      ancho: video.videoWidth,
      alto: video.videoHeight,
      duracion: video.duration,
      arriba: pixel(video, video.videoWidth, video.videoHeight, 2),
      abajo: pixel(
        video,
        video.videoWidth,
        video.videoHeight,
        video.videoHeight - 3
      ),
    }
    const buscado = esperar("seeked")
    video.currentTime = Math.max(0, video.duration - 0.05)
    await buscado
    const final = pixel(video, video.videoWidth, video.videoHeight, 2)
    URL.revokeObjectURL(url)
    return {
      ...lectura,
      finalDecodificado: final.every((canal, i) => canal === lectura.arriba[i]),
    }
  } catch (error) {
    return {
      ancho: 0,
      alto: 0,
      duracion: null,
      arriba: [],
      abajo: [],
      finalDecodificado: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function colorCercano(leido: number[], esperado: readonly number[]): boolean {
  return (
    leido.length === 3 &&
    leido.every((canal, i) => Math.abs(canal - esperado[i]) <= TOLERANCIA_COLOR)
  )
}

function fallasDe(caso: Caso, lectura: Lectura): string[] {
  if (lectura.error) return [`no se pudo leer: ${lectura.error}`]
  const fallas: string[] = []
  if (lectura.ancho !== caso.ancho || lectura.alto !== caso.alto) {
    fallas.push(
      `medidas ${lectura.ancho}×${lectura.alto}, se esperaba ${caso.ancho}×${caso.alto}`
    )
  }
  if (caso.segundos !== undefined) {
    if (
      lectura.duracion === null ||
      Math.abs(lectura.duracion - caso.segundos) > 0.001
    ) {
      fallas.push(
        `duración ${lectura.duracion} s, se esperaba ${caso.segundos} s`
      )
    }
    if (!lectura.finalDecodificado)
      fallas.push("el último cuadro no se decodificó")
  }
  if (!colorCercano(lectura.arriba, FRANJA_MUESTRA)) {
    fallas.push(`franja ${lectura.arriba.join(",")}`)
  }
  if (!colorCercano(lectura.abajo, FONDO_MUESTRA)) {
    fallas.push(`fondo ${lectura.abajo.join(",")}`)
  }
  if (caso.bytesMinimos && caso.archivo.buffer.length < caso.bytesMinimos) {
    fallas.push(
      `pesa ${caso.archivo.buffer.length} B, menos de ${caso.bytesMinimos}`
    )
  }
  return fallas
}

function casos(): Caso[] {
  const imagen = (
    ancho: number,
    alto: number,
    formato: "png" | "jpeg",
    bytesMinimos?: number
  ): Caso => ({
    archivo: imagenPrueba({ ancho, alto, formato, bytesMinimos }),
    ancho,
    alto,
    bytesMinimos,
  })
  const video = (ancho: number, alto: number, segundos: number): Caso => ({
    archivo: videoPrueba({ ancho, alto, segundos }),
    ancho,
    alto,
    segundos,
  })
  return [
    imagen(1080, 1080, "png"),
    imagen(1080, 1350, "jpeg"),
    imagen(1080, 565, "png"),
    imagen(1081, 1919, "jpeg"),
    imagen(1080, 1350, "png", 12 * MIB),
    imagen(1080, 1080, "jpeg", 12 * MIB),
    video(360, 640, 3),
    video(640, 360, 2.5),
    video(1080, 1920, 4),
    video(1920, 1080, 1),
    video(360, 640, 95),
  ]
}

async function comprobar(page: Page, caso: Caso): Promise<string[]> {
  const lectura = await page.evaluate(leerEnNavegador, {
    base64: caso.archivo.buffer.toString("base64"),
    mime: caso.archivo.mimeType,
    esVideo: caso.archivo.mimeType.startsWith("video/"),
  })
  const fallas = fallasDe(caso, lectura)
  const peso = `${(caso.archivo.buffer.length / MIB).toFixed(2)} MB`
  const detalle =
    lectura.duracion === null
      ? `${lectura.ancho}×${lectura.alto}`
      : `${lectura.ancho}×${lectura.alto}, ${lectura.duracion} s`
  process.stderr.write(
    `${fallas.length === 0 ? "✓" : "✗"} ${caso.archivo.name} (${peso}): ${detalle}${fallas.length > 0 ? ` — ${fallas.join("; ")}` : ""}\n`
  )
  return fallas
}

async function main(): Promise<void> {
  const navegador = await chromium.launch()
  try {
    const page = await navegador.newPage()
    await page.setContent("<!doctype html><title>Archivos de prueba</title>")
    // tsx (esbuild) envuelve las funciones con nombre en `__name(…)`; la que
    // se serializa para la página lo necesita definido allá.
    await page.evaluate("globalThis.__name = (funcion) => funcion")
    process.stderr.write(`Chromium ${navegador.version()}\n`)
    let fallidos = 0
    for (const caso of casos()) {
      if ((await comprobar(page, caso)).length > 0) fallidos += 1
    }
    if (fallidos > 0) {
      process.stderr.write(
        `${fallidos} archivo(s) no se leyeron como se esperaba.\n`
      )
      process.exitCode = 1
    }
  } finally {
    await navegador.close()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `comprobar-archivos-prueba falló: ${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
})
