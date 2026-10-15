/**
 * Imágenes de gráficos con marca: el lienzo de Chart.js es transparente y su
 * leyenda es HTML, así que se compone sobre la superficie del tema con título,
 * descripción, leyenda dibujada y sello de AMO. Sirve para "Exportar PNG" y
 * para incrustar gráficos y mapas en el PDF.
 */
import { descargarArchivo, MIME, nombreArchivo } from "./descarga"
import type { ImagenPng } from "./logo"
import { selloGeneracion } from "./marca"

export interface EstiloLienzo {
  superficie: string
  texto: string
  textoSecundario: string
  fuente: string
}

/** Entrada de leyenda: la muestra imita la marca de la serie. */
export interface ElementoLeyendaImagen {
  nombre: string
  color: string
  marca: "linea" | "discontinua" | "bloque"
  valor?: string
}

export interface OpcionesImagenGrafico {
  estilo: EstiloLienzo
  titulo?: string
  descripcion?: string
  leyenda?: readonly ElementoLeyendaImagen[]
  /** Pie (atribución de Mapbox, nota del dato…). */
  pie?: string
  /**
   * Leyenda al lado del gráfico (como la dona en pantalla) o arriba. Sin
   * valor se decide por la forma: al lado solo si el gráfico es casi cuadrado.
   */
  leyendaAlLado?: boolean
  /** Sello "AMO · fecha" en la esquina inferior (por defecto, sí). */
  conSello?: boolean
  fecha?: Date
}

const MARGEN = 24
const ALTO_TITULO = 22
const ALTO_DESCRIPCION = 18
const ESPACIO_CABECERA = 12
const ALTO_FILA_LEYENDA = 18
const ALTO_PIE = 22
const MUESTRA = 14
const HUECO = 6
const SEPARACION_LEYENDA = 16

/** Densidad del lienzo de origen (Chart.js dibuja a `devicePixelRatio`). */
function escalaDe(origen: HTMLCanvasElement): number {
  const anchoCss = origen.clientWidth || origen.width
  return Math.max(1, origen.width / anchoCss)
}

function recortarTexto(
  contexto: CanvasRenderingContext2D,
  texto: string,
  ancho: number
): string {
  if (contexto.measureText(texto).width <= ancho) return texto
  let recortado = texto
  while (
    recortado.length > 1 &&
    contexto.measureText(`${recortado}…`).width > ancho
  ) {
    recortado = recortado.slice(0, -1)
  }
  return `${recortado}…`
}

const fuenteLeyenda = (estilo: EstiloLienzo, escala: number, peso = 400) =>
  `${peso} ${11 * escala}px ${estilo.fuente}`

interface ElementoUbicado {
  elemento: ElementoLeyendaImagen
  x: number
}

function anchoElemento(
  contexto: CanvasRenderingContext2D,
  elemento: ElementoLeyendaImagen,
  estilo: EstiloLienzo,
  escala: number
): number {
  contexto.font = fuenteLeyenda(estilo, escala)
  let ancho =
    (MUESTRA + HUECO) * escala + contexto.measureText(elemento.nombre).width
  if (elemento.valor) {
    contexto.font = fuenteLeyenda(estilo, escala, 600)
    ancho += HUECO * escala + contexto.measureText(elemento.valor).width
  }
  return ancho
}

/** Reparte la leyenda en filas que caben en el ancho disponible. */
function filasLeyenda(
  contexto: CanvasRenderingContext2D,
  elementos: readonly ElementoLeyendaImagen[],
  estilo: EstiloLienzo,
  escala: number,
  anchoDisponible: number
): ElementoUbicado[][] {
  const filas: ElementoUbicado[][] = []
  let x = 0
  for (const elemento of elementos) {
    const ancho = anchoElemento(contexto, elemento, estilo, escala)
    if (filas.length === 0 || (x > 0 && x + ancho > anchoDisponible)) {
      filas.push([])
      x = 0
    }
    filas.at(-1)?.push({ elemento, x })
    x += ancho + SEPARACION_LEYENDA * escala
  }
  return filas
}

function dibujarMuestra(
  contexto: CanvasRenderingContext2D,
  { color, marca }: ElementoLeyendaImagen,
  x: number,
  centro: number,
  escala: number
) {
  contexto.save()
  contexto.fillStyle = color
  contexto.strokeStyle = color
  if (marca === "bloque") {
    const lado = 10 * escala
    contexto.beginPath()
    contexto.roundRect(
      x + 2 * escala,
      centro - lado / 2,
      lado,
      lado,
      3 * escala
    )
    contexto.fill()
  } else {
    contexto.lineWidth = 2 * escala
    contexto.setLineDash(
      marca === "discontinua" ? [4 * escala, 3 * escala] : []
    )
    contexto.beginPath()
    contexto.moveTo(x, centro)
    contexto.lineTo(x + MUESTRA * escala, centro)
    contexto.stroke()
  }
  contexto.restore()
}

function dibujarLeyenda(
  contexto: CanvasRenderingContext2D,
  filas: readonly ElementoUbicado[][],
  estilo: EstiloLienzo,
  escala: number,
  origenX: number,
  origenY: number
) {
  contexto.textBaseline = "middle"
  filas.forEach((fila, indice) => {
    const centro = origenY + (indice + 0.5) * ALTO_FILA_LEYENDA * escala
    for (const { elemento, x } of fila) {
      const inicio = origenX + x
      dibujarMuestra(contexto, elemento, inicio, centro, escala)
      const xTexto = inicio + (MUESTRA + HUECO) * escala
      contexto.font = fuenteLeyenda(estilo, escala)
      contexto.fillStyle = estilo.textoSecundario
      contexto.fillText(elemento.nombre, xTexto, centro)
      if (elemento.valor) {
        const xValor =
          xTexto + contexto.measureText(elemento.nombre).width + HUECO * escala
        contexto.font = fuenteLeyenda(estilo, escala, 600)
        contexto.fillStyle = estilo.texto
        contexto.fillText(elemento.valor, xValor, centro)
      }
    }
  })
  contexto.textBaseline = "top"
}

/** Proporción bajo la cual el gráfico es "cuadrado" (dona): leyenda al lado. */
const PROPORCION_LEYENDA_AL_LADO = 1.4
const SEPARACION_LATERAL = 24

interface Disposicion {
  alLado: boolean
  filas: ElementoUbicado[][]
  /** Ancho de la columna de leyenda (solo al lado), en px del lienzo. */
  anchoLeyenda: number
  /** Alto de la leyenda en unidades CSS (arriba) o px del lienzo (al lado). */
  altoLeyenda: number
}

function disponerLeyenda(
  contexto: CanvasRenderingContext2D,
  origen: HTMLCanvasElement,
  leyenda: readonly ElementoLeyendaImagen[],
  estilo: EstiloLienzo,
  escala: number,
  pedidaAlLado: boolean | undefined
): Disposicion {
  const alLado =
    leyenda.length > 0 &&
    (pedidaAlLado ?? origen.width / origen.height < PROPORCION_LEYENDA_AL_LADO)
  if (!alLado) {
    const filas = filasLeyenda(contexto, leyenda, estilo, escala, origen.width)
    return {
      alLado,
      filas,
      anchoLeyenda: 0,
      altoLeyenda: filas.length
        ? filas.length * ALTO_FILA_LEYENDA + ESPACIO_CABECERA
        : 0,
    }
  }
  const filas = leyenda.map((elemento) => [{ elemento, x: 0 }])
  const anchoLeyenda = Math.max(
    ...leyenda.map((elemento) =>
      anchoElemento(contexto, elemento, estilo, escala)
    )
  )
  return {
    alLado,
    filas,
    anchoLeyenda,
    altoLeyenda: filas.length * ALTO_FILA_LEYENDA * escala,
  }
}

/**
 * Nuevo lienzo con fondo, textos, leyenda y el gráfico; no modifica el
 * original. La leyenda va arriba o al lado (`leyendaAlLado`).
 */
export function componerImagenGrafico(
  origen: HTMLCanvasElement,
  {
    estilo,
    titulo,
    descripcion,
    leyenda = [],
    leyendaAlLado,
    pie,
    conSello = true,
    fecha = new Date(),
  }: OpcionesImagenGrafico
): HTMLCanvasElement {
  const escala = escalaDe(origen)
  const margen = MARGEN * escala
  const lienzo = document.createElement("canvas")
  const contexto = lienzo.getContext("2d")
  if (!contexto) throw new Error("Canvas 2D no disponible")

  const disposicion = disponerLeyenda(
    contexto,
    origen,
    leyenda,
    estilo,
    escala,
    leyendaAlLado
  )
  const lateral = disposicion.alLado
    ? SEPARACION_LATERAL * escala + disposicion.anchoLeyenda
    : 0
  const anchoContenido = origen.width + lateral
  const altoCuerpo = disposicion.alLado
    ? Math.max(origen.height, disposicion.altoLeyenda)
    : origen.height + disposicion.altoLeyenda * escala
  const altoCabecera =
    (titulo ? ALTO_TITULO : 0) +
    (descripcion ? ALTO_DESCRIPCION : 0) +
    (titulo || descripcion ? ESPACIO_CABECERA : 0)
  const altoPie = pie || conSello ? ALTO_PIE : 0

  lienzo.width = Math.round(anchoContenido + margen * 2)
  lienzo.height = Math.round(
    altoCuerpo + margen * 2 + (altoCabecera + altoPie) * escala
  )
  contexto.fillStyle = estilo.superficie
  contexto.fillRect(0, 0, lienzo.width, lienzo.height)
  contexto.textBaseline = "top"

  let y = margen
  if (titulo) {
    contexto.fillStyle = estilo.texto
    contexto.font = `600 ${16 * escala}px ${estilo.fuente}`
    contexto.fillText(
      recortarTexto(contexto, titulo, anchoContenido),
      margen,
      y
    )
    y += ALTO_TITULO * escala
  }
  if (descripcion) {
    contexto.fillStyle = estilo.textoSecundario
    contexto.font = `400 ${12 * escala}px ${estilo.fuente}`
    contexto.fillText(
      recortarTexto(contexto, descripcion, anchoContenido),
      margen,
      y
    )
    y += ALTO_DESCRIPCION * escala
  }
  if (titulo || descripcion) y += ESPACIO_CABECERA * escala

  if (disposicion.alLado) {
    const yGrafico = y + (altoCuerpo - origen.height) / 2
    contexto.drawImage(origen, margen, yGrafico)
    const yLeyenda = y + (altoCuerpo - disposicion.altoLeyenda) / 2
    const xLeyenda = margen + origen.width + SEPARACION_LATERAL * escala
    dibujarLeyenda(
      contexto,
      disposicion.filas,
      estilo,
      escala,
      xLeyenda,
      yLeyenda
    )
  } else {
    if (disposicion.filas.length) {
      dibujarLeyenda(contexto, disposicion.filas, estilo, escala, margen, y)
    }
    contexto.drawImage(origen, margen, y + disposicion.altoLeyenda * escala)
  }
  y += altoCuerpo + 8 * escala

  contexto.fillStyle = estilo.textoSecundario
  contexto.font = `400 ${10 * escala}px ${estilo.fuente}`
  if (pie) {
    contexto.fillText(
      recortarTexto(contexto, pie, anchoContenido * 0.6),
      margen,
      y
    )
  }
  if (conSello) {
    contexto.textAlign = "right"
    contexto.fillText(
      `AMO · ${selloGeneracion(fecha)}`,
      lienzo.width - margen,
      y
    )
  }
  return lienzo
}

export function lienzoAPng(lienzo: HTMLCanvasElement): ImagenPng {
  return {
    dataUrl: lienzo.toDataURL(MIME.png),
    ancho: lienzo.width,
    alto: lienzo.height,
  }
}

function aBlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) =>
        blob
          ? resolver(blob)
          : rechazar(new Error("No se pudo generar la imagen")),
      MIME.png
    )
  })
}

/** Descarga un lienzo ya compuesto como PNG ("gmv-mensual-2026-09-30.png"). */
export async function descargarLienzoPng(
  lienzo: HTMLCanvasElement,
  nombreBase: string
): Promise<void> {
  const blob = await aBlob(lienzo)
  descargarArchivo(blob, nombreArchivo(nombreBase, "png"), MIME.png)
}

/** Compone el gráfico con su marca y lo descarga como PNG. */
export async function exportarPngGrafico(
  origen: HTMLCanvasElement,
  opciones: OpcionesImagenGrafico & { nombreBase: string }
): Promise<void> {
  await descargarLienzoPng(
    componerImagenGrafico(origen, opciones),
    opciones.nombreBase
  )
}
