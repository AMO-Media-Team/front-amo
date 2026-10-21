/**
 * Informe PDF con marca AMO (jsPDF + autotable, se importan solo al exportar):
 * encabezado con logo en cada página, bloque de título con filtros y sello de
 * generación, secciones de indicadores, tablas, texto e imágenes (gráficos vía
 * `componerImagenGrafico`, mapas con su atribución) y pie con "Página X de Y"
 * y marca de confidencialidad.
 */
import type { jsPDF } from "jspdf"

import { descargarArchivo, MIME, nombreArchivo } from "./descarga"
import { cargarLogoMarca, type ImagenPng } from "./logo"
import {
  AUTOR_DOCUMENTO,
  COLOR_DOCUMENTO,
  type FiltroDocumento,
  rgb,
  selloGeneracion,
  TEXTO_CONFIDENCIAL,
} from "./marca"

export interface ColumnaPdf {
  titulo: string
  alinear?: "izquierda" | "centro" | "derecha"
}

export interface IndicadorPdf {
  etiqueta: string
  valor: string
  detalle?: string
}

export type SeccionPdf =
  | {
      tipo: "tabla"
      titulo?: string
      columnas: readonly ColumnaPdf[]
      /** Celdas ya formateadas (es-CO) por quien exporta. */
      filas: readonly (readonly string[])[]
      nota?: string
    }
  | {
      tipo: "imagen"
      titulo?: string
      imagen: ImagenPng
      /** Pie bajo la imagen: atribución de Mapbox, fuente del dato… */
      pie?: string
      /** Fracción del ancho útil (por defecto 1). */
      anchoRelativo?: number
      /** Fracción máxima del alto útil de la página (por defecto 0,6). */
      altoRelativo?: number
    }
  | { tipo: "indicadores"; titulo?: string; elementos: readonly IndicadorPdf[] }
  | { tipo: "texto"; titulo?: string; parrafos: readonly string[] }

export interface DocumentoPdf {
  titulo: string
  subtitulo?: string
  filtros?: readonly FiltroDocumento[]
  secciones: readonly SeccionPdf[]
  orientacion?: "vertical" | "horizontal"
  generadoPor?: string
  fecha?: Date
}

const MARGEN = 40
const ALTO_ENCABEZADO = 58
const INICIO_CONTENIDO = 76
const ALTO_PIE = 44
const ALTO_LOGO = 18
const ESPACIO_SECCION = 22
const FUENTE = "helvetica"
const ALTO_TITULO_SECCION = 20
/** Encabezado + dos filas: una tabla no empieza con una fila suelta. */
const ALTO_INICIO_TABLA = 70
const ALTO_INICIO_TEXTO = 40
const ALTO_PIE_IMAGEN = 16
const ALTO_RELATIVO_IMAGEN = 0.6

/**
 * Helvetica de jsPDF solo dibuja Latin-1: lo que queda fuera se omite en
 * silencio ("1–30" saldría "130"). Se sustituye por su equivalente legible.
 */
const SUSTITUCIONES_PDF: ReadonlyArray<readonly [RegExp, string]> = [
  // Espacios duros y finos que usa Intl en cifras y fechas.
  [/[\u00a0\u2007\u2009\u202f]/g, " "],
  // Signo menos tipográfico, semirraya y raya.
  [/[\u2212\u2013\u2014]/g, "-"],
  [/\u2026/g, "..."],
  [/\u2265/g, ">="],
  [/\u2264/g, "<="],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201c\u201d]/g, '"'],
  // Flechas de tendencia: el signo de la cifra ya indica la dirección.
  [/[\u2191\u2193\u2192\u2197\u2198]\s*/g, ""],
]

export function textoPdf(texto: string): string {
  return SUSTITUCIONES_PDF.reduce(
    (resultado, [patron, reemplazo]) => resultado.replace(patron, reemplazo),
    texto
  ).trim()
}

type Rgb = [number, number, number]
const color = {
  primario: rgb(COLOR_DOCUMENTO.primario),
  profundo: rgb(COLOR_DOCUMENTO.primarioProfundo),
  tinte: rgb(COLOR_DOCUMENTO.tinte),
  texto: rgb(COLOR_DOCUMENTO.texto),
  secundario: rgb(COLOR_DOCUMENTO.textoSecundario),
  borde: rgb(COLOR_DOCUMENTO.borde),
} satisfies Record<string, Rgb>

class Maquetador {
  y = INICIO_CONTENIDO

  constructor(private readonly doc: jsPDF) {}

  get ancho(): number {
    return this.doc.internal.pageSize.getWidth()
  }

  get alto(): number {
    return this.doc.internal.pageSize.getHeight()
  }

  get anchoUtil(): number {
    return this.ancho - MARGEN * 2
  }

  get limite(): number {
    return this.alto - ALTO_PIE - 12
  }

  /** Salta de página si lo que sigue no cabe. */
  reservar(alto: number): void {
    if (this.y + alto <= this.limite) return
    this.doc.addPage()
    this.y = INICIO_CONTENIDO
  }

  texto(
    contenido: string,
    {
      tamano,
      peso = "normal",
      tinta = color.texto,
      interlineado = 1.35,
    }: {
      tamano: number
      peso?: "normal" | "bold" | "italic"
      tinta?: Rgb
      interlineado?: number
    }
  ): void {
    this.doc.setFont(FUENTE, peso)
    this.doc.setFontSize(tamano)
    this.doc.setTextColor(...tinta)
    const lineas: string[] = this.doc.splitTextToSize(
      textoPdf(contenido),
      this.anchoUtil
    )
    const altoLinea = tamano * interlineado
    for (const linea of lineas) {
      this.reservar(altoLinea)
      this.doc.text(linea, MARGEN, this.y, { baseline: "top" })
      this.y += altoLinea
    }
  }

  get altoUtil(): number {
    return this.limite - INICIO_CONTENIDO
  }

  /** El título nunca queda huérfano: viaja con el primer bloque de su sección. */
  tituloSeccion(titulo: string | undefined, altoSiguiente: number): void {
    if (!titulo) return
    this.reservar(ALTO_TITULO_SECCION + altoSiguiente)
    this.texto(titulo, { tamano: 12, peso: "bold", tinta: color.profundo })
    this.y += 4
  }
}

function bloqueTitulo(
  maquetador: Maquetador,
  datos: DocumentoPdf,
  fecha: Date
): void {
  maquetador.texto(datos.titulo, {
    tamano: 20,
    peso: "bold",
    interlineado: 1.2,
  })
  if (datos.subtitulo) {
    maquetador.y += 2
    maquetador.texto(datos.subtitulo, { tamano: 11, tinta: color.secundario })
  }
  maquetador.y += 8
  if (datos.filtros?.length) {
    const filtros = datos.filtros
      .map((f) => `${f.etiqueta}: ${f.valor}`)
      .join("   ·   ")
    maquetador.texto(filtros, { tamano: 9, tinta: color.texto })
  }
  const autor = datos.generadoPor ? ` por ${datos.generadoPor}` : ""
  maquetador.texto(`Generado el ${selloGeneracion(fecha)}${autor}`, {
    tamano: 9,
    tinta: color.secundario,
  })
  maquetador.y += ESPACIO_SECCION
}

const INDICADOR = {
  relleno: 10,
  separacion: 10,
  lineaEtiqueta: 10,
  altoValor: 22,
  lineaDetalle: 9,
} as const

function lineas(
  doc: jsPDF,
  texto: string,
  tamano: number,
  ancho: number
): string[] {
  doc.setFontSize(tamano)
  return doc.splitTextToSize(textoPdf(texto), ancho)
}

function medirIndicador(doc: jsPDF, indicador: IndicadorPdf, ancho: number) {
  const util = ancho - INDICADOR.relleno * 2
  doc.setFont(FUENTE, "normal")
  const etiqueta = lineas(doc, indicador.etiqueta, 8, util)
  const detalle = indicador.detalle
    ? lineas(doc, indicador.detalle, 7.5, util)
    : []
  const alto =
    INDICADOR.relleno * 2 +
    etiqueta.length * INDICADOR.lineaEtiqueta +
    INDICADOR.altoValor +
    detalle.length * INDICADOR.lineaDetalle
  return { etiqueta, detalle, alto }
}

function dibujarIndicador(
  doc: jsPDF,
  indicador: IndicadorPdf,
  medida: ReturnType<typeof medirIndicador>,
  caja: { x: number; y: number; ancho: number; alto: number }
): void {
  const { x, ancho, alto } = caja
  let y = caja.y + INDICADOR.relleno
  const texto = x + INDICADOR.relleno
  doc.setFillColor(...color.tinte)
  doc.setDrawColor(...color.borde)
  doc.roundedRect(x, caja.y, ancho, alto, 6, 6, "FD")

  doc.setFont(FUENTE, "normal")
  doc.setFontSize(8)
  doc.setTextColor(...color.secundario)
  doc.text(medida.etiqueta, texto, y, { baseline: "top" })
  y += medida.etiqueta.length * INDICADOR.lineaEtiqueta + 2

  doc.setFont(FUENTE, "bold")
  doc.setFontSize(14)
  doc.setTextColor(...color.texto)
  doc.text(textoPdf(indicador.valor), texto, y, {
    baseline: "top",
    maxWidth: ancho - INDICADOR.relleno * 2,
  })
  y += INDICADOR.altoValor - 2

  if (medida.detalle.length) {
    doc.setFont(FUENTE, "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...color.secundario)
    doc.text(medida.detalle, texto, y, { baseline: "top" })
  }
}

function anchoIndicador(maquetador: Maquetador, porFila: number): number {
  return (maquetador.anchoUtil - INDICADOR.separacion * (porFila - 1)) / porFila
}

/** Alto de la primera fila de indicadores (para no dejar su título solo). */
function altoPrimeraFila(
  doc: jsPDF,
  maquetador: Maquetador,
  elementos: readonly IndicadorPdf[]
): number {
  const porFila = Math.min(4, Math.max(1, elementos.length))
  const ancho = anchoIndicador(maquetador, porFila)
  return Math.max(
    0,
    ...elementos
      .slice(0, porFila)
      .map((e) => medirIndicador(doc, e, ancho).alto)
  )
}

function seccionIndicadores(
  doc: jsPDF,
  maquetador: Maquetador,
  elementos: readonly IndicadorPdf[]
): void {
  const porFila = Math.min(4, Math.max(1, elementos.length))
  const ancho = anchoIndicador(maquetador, porFila)
  for (let i = 0; i < elementos.length; i += porFila) {
    const fila = elementos.slice(i, i + porFila)
    const medidas = fila.map((indicador) =>
      medirIndicador(doc, indicador, ancho)
    )
    // Toda la fila con el alto de la tarjeta más alta.
    const alto = Math.max(...medidas.map((m) => m.alto))
    maquetador.reservar(alto + INDICADOR.separacion)
    fila.forEach((indicador, j) => {
      dibujarIndicador(doc, indicador, medidas[j], {
        x: MARGEN + j * (ancho + INDICADOR.separacion),
        y: maquetador.y,
        ancho,
        alto,
      })
    })
    maquetador.y += alto + INDICADOR.separacion
  }
}

const ALINEACION = {
  izquierda: "left",
  centro: "center",
  derecha: "right",
} as const

async function seccionTabla(
  doc: jsPDF,
  maquetador: Maquetador,
  seccion: Extract<SeccionPdf, { tipo: "tabla" }>
): Promise<void> {
  const { autoTable } = await import("jspdf-autotable")
  let finalY = maquetador.y
  autoTable(doc, {
    startY: maquetador.y,
    margin: {
      top: INICIO_CONTENIDO,
      left: MARGEN,
      right: MARGEN,
      bottom: ALTO_PIE + 12,
    },
    head: [seccion.columnas.map((c) => textoPdf(c.titulo))],
    body: seccion.filas.map((fila) => fila.map(textoPdf)),
    theme: "plain",
    styles: {
      font: FUENTE,
      fontSize: 8.5,
      textColor: color.texto,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
      lineColor: color.borde,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: color.primario,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: { lineWidth: { bottom: 0.5 } },
    alternateRowStyles: { fillColor: [250, 249, 253] },
    columnStyles: Object.fromEntries(
      seccion.columnas.map((c, i) => [
        i,
        { halign: ALINEACION[c.alinear ?? "izquierda"] },
      ])
    ),
    didParseCell: (celda) => {
      if (celda.section === "head") {
        celda.cell.styles.halign =
          ALINEACION[
            seccion.columnas[celda.column.index]?.alinear ?? "izquierda"
          ]
      }
    },
    didDrawPage: (pagina) => {
      finalY = pagina.cursor?.y ?? finalY
    },
  })
  maquetador.y = finalY + 8
  if (seccion.nota)
    maquetador.texto(seccion.nota, {
      tamano: 8,
      peso: "italic",
      tinta: color.secundario,
    })
}

type SeccionImagen = Extract<SeccionPdf, { tipo: "imagen" }>

/** Ancho útil (o la fracción pedida) sin pasar del alto máximo relativo. */
function medidasImagen(maquetador: Maquetador, seccion: SeccionImagen) {
  const altoMaximo =
    maquetador.altoUtil *
    Math.min(1, seccion.altoRelativo ?? ALTO_RELATIVO_IMAGEN)
  let ancho = maquetador.anchoUtil * Math.min(1, seccion.anchoRelativo ?? 1)
  let alto = (ancho * seccion.imagen.alto) / seccion.imagen.ancho
  if (alto > altoMaximo) {
    ancho *= altoMaximo / alto
    alto = altoMaximo
  }
  return { ancho, alto }
}

/** Alto del primer bloque de cada sección (acompaña a su título). */
function altoInicial(
  doc: jsPDF,
  maquetador: Maquetador,
  seccion: SeccionPdf
): number {
  switch (seccion.tipo) {
    case "imagen":
      return (
        medidasImagen(maquetador, seccion).alto +
        (seccion.pie ? ALTO_PIE_IMAGEN : 0)
      )
    case "indicadores":
      return altoPrimeraFila(doc, maquetador, seccion.elementos)
    case "tabla":
      return ALTO_INICIO_TABLA
    case "texto":
      return ALTO_INICIO_TEXTO
  }
}

function seccionImagen(
  doc: jsPDF,
  maquetador: Maquetador,
  seccion: SeccionImagen
): void {
  const { ancho, alto } = medidasImagen(maquetador, seccion)
  maquetador.reservar(alto + (seccion.pie ? ALTO_PIE_IMAGEN : 0))
  const x = MARGEN + (maquetador.anchoUtil - ancho) / 2
  doc.addImage(
    seccion.imagen.dataUrl,
    "PNG",
    x,
    maquetador.y,
    ancho,
    alto,
    undefined,
    "FAST"
  )
  maquetador.y += alto + 6
  if (seccion.pie)
    maquetador.texto(seccion.pie, { tamano: 7.5, tinta: color.secundario })
}

function encabezadosYPies(
  doc: jsPDF,
  datos: DocumentoPdf,
  logo: ImagenPng | null
): void {
  const total = doc.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let pagina = 1; pagina <= total; pagina++) {
    doc.setPage(pagina)
    doc.setFillColor(...color.primario)
    doc.rect(0, 0, ancho, 4, "F")
    if (logo) {
      const anchoLogo = (ALTO_LOGO * logo.ancho) / logo.alto
      doc.addImage(
        logo.dataUrl,
        "PNG",
        MARGEN,
        22,
        anchoLogo,
        ALTO_LOGO,
        "logo-amo",
        "FAST"
      )
    }
    doc.setFont(FUENTE, "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...color.secundario)
    doc.text(textoPdf(datos.titulo), ancho - MARGEN, 31, {
      align: "right",
      baseline: "middle",
    })
    doc.setDrawColor(...color.borde)
    doc.setLineWidth(0.5)
    doc.line(MARGEN, ALTO_ENCABEZADO - 6, ancho - MARGEN, ALTO_ENCABEZADO - 6)

    const yPie = alto - ALTO_PIE + 14
    doc.line(MARGEN, yPie - 10, ancho - MARGEN, yPie - 10)
    doc.setFontSize(7.5)
    doc.text(textoPdf(TEXTO_CONFIDENCIAL), MARGEN, yPie, { baseline: "top" })
    doc.text(`Página ${pagina} de ${total}`, ancho - MARGEN, yPie, {
      align: "right",
      baseline: "top",
    })
  }
}

/** Construye el documento en memoria (sin descargar): lo usan la exportación y las pruebas. */
export async function construirPdf(
  datos: DocumentoPdf,
  logo: ImagenPng | null
): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await import("jspdf")
  const fecha = datos.fecha ?? new Date()
  const doc = new JsPdf({
    orientation: datos.orientacion === "horizontal" ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  })
  doc.setProperties({
    title: textoPdf(datos.titulo),
    author: AUTOR_DOCUMENTO,
    creator: "AMO",
  })
  doc.setLanguage("es-CO")

  const maquetador = new Maquetador(doc)
  bloqueTitulo(maquetador, datos, fecha)

  for (const seccion of datos.secciones) {
    maquetador.tituloSeccion(
      seccion.titulo,
      altoInicial(doc, maquetador, seccion)
    )
    switch (seccion.tipo) {
      case "tabla":
        await seccionTabla(doc, maquetador, seccion)
        break
      case "imagen":
        seccionImagen(doc, maquetador, seccion)
        break
      case "indicadores":
        seccionIndicadores(doc, maquetador, seccion.elementos)
        break
      case "texto":
        for (const parrafo of seccion.parrafos) {
          maquetador.texto(parrafo, { tamano: 10 })
          maquetador.y += 4
        }
        break
    }
    maquetador.y += ESPACIO_SECCION
  }

  encabezadosYPies(doc, datos, logo)
  return doc
}

/** Genera el PDF (con logo si carga) y lo descarga. */
export async function exportarPdf(
  datos: DocumentoPdf,
  nombreBase = datos.titulo
): Promise<void> {
  const logo = await cargarLogoMarca()
  const doc = await construirPdf(datos, logo)
  descargarArchivo(
    doc.output("blob"),
    nombreArchivo(nombreBase, "pdf"),
    MIME.pdf
  )
}
