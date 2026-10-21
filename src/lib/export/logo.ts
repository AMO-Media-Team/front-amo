/**
 * Logo de marca como PNG para documentos (ExcelJS y jsPDF no admiten SVG). Se
 * rasteriza en el navegador el logotipo horizontal para fondo claro de
 * `public/brand` a alta resolución; si falla, se usa el icono PNG de la app.
 * Una sola carga por pestaña.
 */

export interface ImagenPng {
  /** `data:image/png;base64,…` */
  dataUrl: string
  /** Tamaño en píxeles de la imagen rasterizada. */
  ancho: number
  alto: number
}

export const RUTA_LOGO_SVG = "/brand/amo-logo-horizontal-descriptor-claro.svg"
export const RUTA_LOGO_PNG = "/brand/amo-icon-192.png"
const ANCHO_RASTER = 900

let enCurso: Promise<ImagenPng | null> | null = null

/** Relación de aspecto a partir del `viewBox` ("minX minY ancho alto"). */
export function proporcionViewBox(svg: string): number | null {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]
  const [, , ancho, alto] =
    viewBox
      ?.trim()
      .split(/[\s,]+/)
      .map(Number) ?? []
  return ancho > 0 && alto > 0 ? ancho / alto : null
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.decoding = "async"
    imagen.onload = () => resolver(imagen)
    imagen.onerror = () => rechazar(new Error(`No se pudo cargar ${src}`))
    imagen.src = src
  })
}

function aPng(
  imagen: CanvasImageSource,
  ancho: number,
  alto: number
): ImagenPng {
  const lienzo = document.createElement("canvas")
  lienzo.width = Math.round(ancho)
  lienzo.height = Math.round(alto)
  const contexto = lienzo.getContext("2d")
  if (!contexto) throw new Error("Canvas 2D no disponible")
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  return {
    dataUrl: lienzo.toDataURL("image/png"),
    ancho: lienzo.width,
    alto: lienzo.height,
  }
}

async function rasterizarSvg(ruta: string): Promise<ImagenPng> {
  const respuesta = await fetch(ruta)
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
  const svg = await respuesta.text()
  const proporcion = proporcionViewBox(svg)
  if (!proporcion) throw new Error("SVG sin viewBox")
  const alto = ANCHO_RASTER / proporcion
  // Con ancho y alto explícitos todos los navegadores rasterizan igual.
  const dimensionado = svg.replace(
    "<svg ",
    `<svg width="${ANCHO_RASTER}" height="${alto}" `
  )
  const url = URL.createObjectURL(
    new Blob([dimensionado], { type: "image/svg+xml" })
  )
  try {
    return aPng(await cargarImagen(url), ANCHO_RASTER, alto)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function cargarPng(ruta: string): Promise<ImagenPng> {
  const imagen = await cargarImagen(ruta)
  return aPng(imagen, imagen.naturalWidth, imagen.naturalHeight)
}

/** Logo listo para incrustar; `null` si ninguna variante pudo cargarse. */
export function cargarLogoMarca(): Promise<ImagenPng | null> {
  enCurso ??= rasterizarSvg(RUTA_LOGO_SVG)
    .catch(() => cargarPng(RUTA_LOGO_PNG))
    .catch(() => {
      enCurso = null
      return null
    })
  return enCurso
}
