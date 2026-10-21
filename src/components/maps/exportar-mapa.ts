/**
 * Exportación del mapa a PNG: la captura del lienzo WebGL más un encabezado
 * (título y periodo), la leyenda y la atribución obligatoria de Mapbox y
 * OpenStreetMap (sus términos exigen conservarla también en imágenes).
 */
import { descargarArchivo, MIME, nombreArchivo } from "@/lib/export/descarga"
import type { TemaMapa } from "@/lib/geo/escalas"

export const ATRIBUCION_MAPA = "© Mapbox · © OpenStreetMap"

export interface ElementoLeyendaExportacion {
  readonly color: string
  readonly etiqueta: string
  /** Muestra rayada ("sin datos"). */
  readonly rayado?: boolean
}

export interface OpcionesExportacion {
  readonly mapa: HTMLCanvasElement
  readonly titulo: string
  readonly subtitulo: string
  readonly leyenda: readonly ElementoLeyendaExportacion[]
  readonly tema: TemaMapa
  /** Píxeles del dispositivo por píxel CSS (el lienzo del mapa ya viene escalado). */
  readonly escala: number
}

const COLORES_EXPORTACION: Readonly<
  Record<
    TemaMapa,
    { fondo: string; texto: string; secundario: string; borde: string }
  >
> = {
  oscuro: {
    fondo: "#0E0B16",
    texto: "#F2EFFA",
    secundario: "#A59EB8",
    borde: "#2A2338",
  },
  claro: {
    fondo: "#FAF9FD",
    texto: "#1B1528",
    secundario: "#615A75",
    borde: "#E7E3F0",
  },
}

function familia(variable: string, respaldo: string): string {
  if (typeof document === "undefined") return respaldo
  const valor = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim()
  return valor ? `${valor}, ${respaldo}` : respaldo
}

function muestraRayada(
  contexto: CanvasRenderingContext2D,
  x: number,
  y: number,
  lado: number,
  color: string
): void {
  contexto.save()
  contexto.beginPath()
  contexto.rect(x, y, lado, lado)
  contexto.clip()
  contexto.strokeStyle = color
  contexto.lineWidth = lado / 8
  for (let d = -lado; d < lado * 2; d += lado / 3) {
    contexto.beginPath()
    contexto.moveTo(x + d, y + lado)
    contexto.lineTo(x + d + lado, y)
    contexto.stroke()
  }
  contexto.restore()
}

/** Dibuja la imagen final en un lienzo nuevo. */
export function componerImagenMapa({
  mapa,
  titulo,
  subtitulo,
  leyenda,
  tema,
  escala,
}: OpcionesExportacion): HTMLCanvasElement {
  const colores = COLORES_EXPORTACION[tema]
  const s = escala
  const cabecera = 76 * s
  const pie = 44 * s
  const lienzo = document.createElement("canvas")
  lienzo.width = mapa.width
  lienzo.height = mapa.height + cabecera + pie
  const ctx = lienzo.getContext("2d")
  if (!ctx) return mapa

  const titulos = familia("--font-jakarta", "system-ui, sans-serif")
  const texto = familia("--font-geist-sans", "system-ui, sans-serif")

  ctx.fillStyle = colores.fondo
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)

  // Encabezado.
  const margen = 24 * s
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = colores.texto
  ctx.font = `700 ${20 * s}px ${titulos}`
  ctx.fillText(titulo, margen, 36 * s)
  ctx.fillStyle = colores.secundario
  ctx.font = `400 ${13 * s}px ${texto}`
  ctx.fillText(subtitulo, margen, 58 * s)
  ctx.textAlign = "right"
  ctx.font = `600 ${13 * s}px ${titulos}`
  ctx.fillText("AMO · Explorador geográfico", lienzo.width - margen, 36 * s)
  ctx.textAlign = "left"

  // Mapa.
  ctx.drawImage(mapa, 0, cabecera)
  ctx.strokeStyle = colores.borde
  ctx.lineWidth = s
  ctx.beginPath()
  ctx.moveTo(0, cabecera + mapa.height + s / 2)
  ctx.lineTo(lienzo.width, cabecera + mapa.height + s / 2)
  ctx.stroke()

  // Leyenda.
  const lado = 12 * s
  const baseY = cabecera + mapa.height + (pie - lado) / 2
  let x = margen
  ctx.font = `400 ${12 * s}px ${texto}`
  for (const elemento of leyenda) {
    ctx.fillStyle = elemento.color
    ctx.fillRect(x, baseY, lado, lado)
    if (elemento.rayado) {
      muestraRayada(ctx, x, baseY, lado, colores.secundario)
    }
    x += lado + 6 * s
    ctx.fillStyle = colores.secundario
    ctx.fillText(elemento.etiqueta, x, baseY + lado - 2 * s)
    x += ctx.measureText(elemento.etiqueta).width + 14 * s
  }

  // Atribución obligatoria.
  ctx.textAlign = "right"
  ctx.fillStyle = colores.secundario
  ctx.fillText(ATRIBUCION_MAPA, lienzo.width - margen, baseY + lado - 2 * s)
  return lienzo
}

/**
 * Descarga la imagen como PNG con el criterio de nombres de las demás
 * exportaciones: "amo-mapa-medios-antioquia-2026-09-30.png" (fecha de Bogotá).
 */
export function descargarMapaPng(
  lienzo: HTMLCanvasElement,
  partesNombre: readonly string[]
): Promise<void> {
  return new Promise<void>((resolver, rechazar) => {
    lienzo.toBlob((blob) => {
      if (!blob) {
        rechazar(new Error("No se pudo generar la imagen."))
        return
      }
      descargarArchivo(
        blob,
        nombreArchivo(["amo-mapa", ...partesNombre].join("-"), "png"),
        MIME.png
      )
      resolver()
    }, MIME.png)
  })
}
