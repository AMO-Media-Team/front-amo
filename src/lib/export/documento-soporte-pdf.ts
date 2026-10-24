/**
 * PDF del documento soporte en adquisiciones a sujetos no obligados a facturar (LIQ-004). Lo construye el
 * servidor al emitir el documento y al registrar su CUDS (jsPDF y autotable se importan al construirlo):
 * encabezado con el logotipo en cada página, número, fecha y resolución de numeración; vendedor y
 * adquiriente; detalle por publicación; retenciones practicadas y neto a pagar; CUDS o «Pendiente de
 * transmisión a la DIAN»; y, si la resolución es de prueba, la marca de agua «VERSIÓN DE PRUEBA — SIN
 * VALIDEZ FISCAL» en cada página.
 *
 * Recibe los datos ya resueltos (nombres, etiquetas y documentos de identidad en texto); aquí solo se dan
 * formato a montos y fechas (es-CO, America/Bogota) y se compone la página.
 */
import type { jsPDF } from "jspdf"

import { parsearFecha } from "@/lib/fechas"
import { formatearCOP, formatearFecha } from "@/lib/format"

import type { ImagenPng } from "./logo"
import { AUTOR_DOCUMENTO, COLOR_DOCUMENTO, rgb, selloGeneracion } from "./marca"
import { textoPdf } from "./pdf"

export const TITULO_DOCUMENTO_SOPORTE =
  "Documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura de venta o documento equivalente"
export const MARCA_PRUEBA = "VERSIÓN DE PRUEBA — SIN VALIDEZ FISCAL"
export const PENDIENTE_TRANSMISION = "Pendiente de transmisión a la DIAN"
export const PENDIENTE_CONFIGURAR = "Pendiente de configurar"
export const SIN_REGISTRAR = "Sin registrar"

/** Autorización de numeración de la DIAN (fechas `AAAA-MM-DD`). */
export interface ResolucionPdf {
  numero: string
  fecha: string
  prefijo: string
  rangoDesde: number
  rangoHasta: number
  vigenteDesde: string
  vigenteHasta: string | null
}

/** Vendedor o adquiriente; `null` = dato ausente (el PDF dice por qué). */
export interface PartePdf {
  nombre: string | null
  /** Ya con su tipo: «CC 1.023.456.789», «NIT 900.123.456-7». */
  documento: string | null
  direccion: string | null
  /** «Pasto, Nariño». */
  municipio: string | null
}

export interface LineaDocumentoPdf {
  /** Título de la oferta. */
  publicacion: string
  marca: string
  /** «Instagram · Post de feed». */
  plataformaFormato: string
  /** Instante de la publicación (ISO); se muestra en hora de Bogotá. */
  fecha: string | null
  valor: number
}

export interface RetencionDocumentoPdf {
  /** «Retención en la fuente · Servicios», «ReteICA · Pasto». */
  nombre: string
  /** Ya formateada: «6 %», «9,66 por mil». */
  tarifa: string
  base: number
  valor: number
}

export interface DatosDocumentoSoportePdf {
  /** Prefijo y consecutivo: «DS1234». */
  numero: string
  /** `AAAA-MM-DD`. */
  fechaEmision: string
  periodo: { inicio: string; fin: string }
  resolucion: ResolucionPdf | null
  vendedor: PartePdf
  adquiriente: PartePdf
  lineas: readonly LineaDocumentoPdf[]
  valorTotal: number
  retenciones: readonly RetencionDocumentoPdf[]
  totalRetenciones: number
  netoAPagar: number
  /** 96 caracteres hexadecimales, o `null` mientras no se transmita. */
  cuds: string | null
  /** Sello de generación (por defecto, ahora). */
  generadoAt?: Date
}

/**
 * Resolución de prueba: prefijo `DEMO` o `PRUEBA`, o número que empieza por `PRUEBA` (las de los datos
 * demo y las de la configuración de pruebas del cliente, p. ej. `PRUEBA-DS`).
 */
export function esResolucionDePrueba(
  resolucion: Pick<ResolucionPdf, "prefijo" | "numero"> | null
): boolean {
  if (!resolucion) return false
  const prefijo = resolucion.prefijo.trim().toUpperCase()
  return (
    prefijo === "DEMO" ||
    prefijo === "PRUEBA" ||
    resolucion.numero.trim().toUpperCase().startsWith("PRUEBA")
  )
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const

function partesDia(dia: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, numero] = dia.split("-").map(Number)
  return { anio, mes, dia: numero }
}

/** `AAAA-MM-DD` en palabras: «17 de octubre de 2026» (sin pasar por UTC). */
export function diaEnPalabras(dia: string | null): string {
  return formatearFecha(parsearFecha(dia), "largo")
}

/**
 * Periodo liquidado sin repetir lo que comparten: «Del 1 al 15 de octubre de 2026», «Del 28 de septiembre
 * al 4 de octubre de 2026» o «Del 20 de diciembre de 2026 al 3 de enero de 2027».
 */
export function periodoEnPalabras(inicio: string, fin: string): string {
  if (!parsearFecha(inicio) || !parsearFecha(fin)) return "—"
  const desde = partesDia(inicio)
  const hasta = partesDia(fin)
  const final = diaEnPalabras(fin)
  if (desde.anio !== hasta.anio)
    return `Del ${diaEnPalabras(inicio)} al ${final}`
  if (desde.mes !== hasta.mes) {
    return `Del ${desde.dia} de ${MESES[desde.mes - 1]} al ${final}`
  }
  return desde.dia === hasta.dia
    ? `El ${final}`
    : `Del ${desde.dia} al ${final}`
}

const formatoEntero = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
})

/** Autorización de numeración en una línea. */
export function textoResolucion(resolucion: ResolucionPdf | null): string {
  if (!resolucion)
    return "Autorización de numeración: sin resolución registrada."
  const prefijo = resolucion.prefijo ? ` · Prefijo ${resolucion.prefijo}` : ""
  const vigencia = resolucion.vigenteHasta
    ? `del ${diaEnPalabras(resolucion.vigenteDesde)} al ${diaEnPalabras(resolucion.vigenteHasta)}`
    : `desde el ${diaEnPalabras(resolucion.vigenteDesde)}`
  return (
    `Autorización de numeración: Resolución DIAN N.º ${resolucion.numero} del ` +
    `${diaEnPalabras(resolucion.fecha)}${prefijo} · Rango del ` +
    `${formatoEntero.format(resolucion.rangoDesde)} al ${formatoEntero.format(resolucion.rangoHasta)} · ` +
    `Vigencia ${vigencia}.`
  )
}

// ── Composición ──────────────────────────────────────────────────────────────

const MARGEN = 40
const INICIO_CONTENIDO = 76
const ALTO_PIE = 44
const ALTO_LOGO = 18
const FUENTE = "helvetica"
const SEPARACION = 18

type Rgb = [number, number, number]
const color = {
  primario: rgb(COLOR_DOCUMENTO.primario),
  profundo: rgb(COLOR_DOCUMENTO.primarioProfundo),
  tinte: rgb(COLOR_DOCUMENTO.tinte),
  texto: rgb(COLOR_DOCUMENTO.texto),
  secundario: rgb(COLOR_DOCUMENTO.textoSecundario),
  borde: rgb(COLOR_DOCUMENTO.borde),
  aviso: [180, 35, 24] as Rgb,
  avisoFondo: [253, 236, 234] as Rgb,
} satisfies Record<string, Rgb>

interface EstiloTexto {
  tamano: number
  peso?: "normal" | "bold" | "italic"
  tinta?: Rgb
  fuente?: string
  interlineado?: number
}

class Pagina {
  y = INICIO_CONTENIDO

  constructor(private readonly doc: jsPDF) {}

  get ancho(): number {
    return this.doc.internal.pageSize.getWidth()
  }

  get anchoUtil(): number {
    return this.ancho - MARGEN * 2
  }

  get limite(): number {
    return this.doc.internal.pageSize.getHeight() - ALTO_PIE - 12
  }

  reservar(alto: number): void {
    if (this.y + alto <= this.limite) return
    this.doc.addPage()
    this.y = INICIO_CONTENIDO
  }

  estilo({
    tamano,
    peso = "normal",
    tinta = color.texto,
    fuente = FUENTE,
  }: EstiloTexto) {
    this.doc.setFont(fuente, peso)
    this.doc.setFontSize(tamano)
    this.doc.setTextColor(...tinta)
  }

  lineas(texto: string, estilo: EstiloTexto, ancho = this.anchoUtil) {
    this.estilo(estilo)
    return this.doc.splitTextToSize(textoPdf(texto), ancho) as string[]
  }

  /** Párrafo a todo el ancho; salta de página entre líneas si hace falta. */
  texto(contenido: string, estilo: EstiloTexto): void {
    const lineas = this.lineas(contenido, estilo)
    const alto = estilo.tamano * (estilo.interlineado ?? 1.35)
    for (const linea of lineas) {
      this.reservar(alto)
      this.estilo(estilo)
      this.doc.text(linea, MARGEN, this.y, { baseline: "top" })
      this.y += alto
    }
  }

  tituloSeccion(titulo: string, altoSiguiente: number): void {
    this.reservar(20 + altoSiguiente)
    this.texto(titulo, { tamano: 11, peso: "bold", tinta: color.profundo })
    this.y += 4
  }
}

function bloqueTitulo(
  doc: jsPDF,
  pagina: Pagina,
  datos: DatosDocumentoSoportePdf,
  prueba: boolean
): void {
  pagina.texto(TITULO_DOCUMENTO_SOPORTE, {
    tamano: 14,
    peso: "bold",
    interlineado: 1.25,
  })
  pagina.y += 8

  if (prueba) {
    const alto = 22
    doc.setFillColor(...color.avisoFondo)
    doc.setDrawColor(...color.aviso)
    doc.roundedRect(MARGEN, pagina.y, pagina.anchoUtil, alto, 4, 4, "FD")
    pagina.estilo({ tamano: 9, peso: "bold", tinta: color.aviso })
    doc.text(textoPdf(MARCA_PRUEBA), pagina.ancho / 2, pagina.y + alto / 2, {
      align: "center",
      baseline: "middle",
    })
    pagina.y += alto + 10
  }

  // Número, fecha y periodo en una franja.
  // Fracciones del ancho: el periodo es el texto más largo.
  const celdas = [
    { etiqueta: "Número", valor: datos.numero, fraccion: 0.24 },
    {
      etiqueta: "Fecha de emisión",
      valor: diaEnPalabras(datos.fechaEmision),
      fraccion: 0.34,
    },
    {
      etiqueta: "Periodo liquidado",
      valor: periodoEnPalabras(datos.periodo.inicio, datos.periodo.fin),
      fraccion: 0.42,
    },
  ]
  const relleno = 10
  const medidas = celdas.map((celda) =>
    pagina.lineas(
      celda.valor,
      { tamano: 11, peso: "bold" },
      pagina.anchoUtil * celda.fraccion - relleno * 2
    )
  )
  const alto = relleno * 2 + 12 + Math.max(...medidas.map((m) => m.length)) * 14
  doc.setFillColor(...color.tinte)
  doc.setDrawColor(...color.borde)
  doc.roundedRect(MARGEN, pagina.y, pagina.anchoUtil, alto, 6, 6, "FD")
  let x = MARGEN + relleno
  celdas.forEach((celda, i) => {
    pagina.estilo({ tamano: 8, tinta: color.secundario })
    doc.text(textoPdf(celda.etiqueta), x, pagina.y + relleno, {
      baseline: "top",
    })
    pagina.estilo({ tamano: 11, peso: "bold" })
    doc.text(medidas[i], x, pagina.y + relleno + 12, { baseline: "top" })
    x += pagina.anchoUtil * celda.fraccion
  })
  pagina.y += alto + 6
  pagina.texto(textoResolucion(datos.resolucion), {
    tamano: 8,
    tinta: color.secundario,
  })
  pagina.y += SEPARACION - 6
}

interface FilaParte {
  etiqueta: string
  valor: string
}

function filasParte(
  parte: PartePdf,
  vacio: string,
  etiquetaDocumento: string
): FilaParte[] {
  return [
    { etiqueta: "Nombre o razón social", valor: parte.nombre ?? vacio },
    { etiqueta: etiquetaDocumento, valor: parte.documento ?? vacio },
    { etiqueta: "Dirección", valor: parte.direccion ?? vacio },
    { etiqueta: "Municipio", valor: parte.municipio ?? vacio },
  ]
}

const PARTE = { etiqueta: 7.5, valor: 9.5, linea: 12, entreFilas: 6 } as const

function bloquePartes(
  doc: jsPDF,
  pagina: Pagina,
  datos: DatosDocumentoSoportePdf
): void {
  const separacion = 16
  const ancho = (pagina.anchoUtil - separacion) / 2
  const columnas = [
    {
      titulo: "Vendedor (no obligado a facturar)",
      filas: filasParte(
        datos.vendedor,
        SIN_REGISTRAR,
        "Documento de identidad"
      ),
    },
    {
      titulo: "Adquiriente",
      filas: filasParte(datos.adquiriente, PENDIENTE_CONFIGURAR, "NIT"),
    },
  ].map((columna) => ({
    ...columna,
    filas: columna.filas.map((fila) => ({
      ...fila,
      lineas: pagina.lineas(fila.valor, { tamano: PARTE.valor }, ancho),
    })),
  }))
  const altoColumna = (filas: (typeof columnas)[number]["filas"]) =>
    18 +
    filas.reduce(
      (total, fila) =>
        total + 10 + fila.lineas.length * PARTE.linea + PARTE.entreFilas,
      0
    )
  pagina.reservar(Math.max(...columnas.map((c) => altoColumna(c.filas))))
  const inicio = pagina.y
  let fin = inicio
  columnas.forEach((columna, i) => {
    const x = MARGEN + i * (ancho + separacion)
    let y = inicio
    pagina.estilo({ tamano: 10, peso: "bold", tinta: color.profundo })
    doc.text(textoPdf(columna.titulo), x, y, { baseline: "top" })
    y += 18
    for (const fila of columna.filas) {
      pagina.estilo({ tamano: PARTE.etiqueta, tinta: color.secundario })
      doc.text(textoPdf(fila.etiqueta), x, y, { baseline: "top" })
      y += 10
      pagina.estilo({ tamano: PARTE.valor })
      doc.text(fila.lineas, x, y, { baseline: "top" })
      y += fila.lineas.length * PARTE.linea + PARTE.entreFilas
    }
    fin = Math.max(fin, y)
  })
  pagina.y = fin + SEPARACION - PARTE.entreFilas
}

type Alineacion = "left" | "center" | "right"

interface TablaPdf {
  columnas: readonly { titulo: string; alinear?: Alineacion; ancho?: number }[]
  filas: readonly (readonly string[])[]
}

async function tabla(doc: jsPDF, pagina: Pagina, datos: TablaPdf) {
  const { autoTable } = await import("jspdf-autotable")
  let finalY = pagina.y
  autoTable(doc, {
    startY: pagina.y,
    margin: {
      top: INICIO_CONTENIDO,
      left: MARGEN,
      right: MARGEN,
      bottom: ALTO_PIE + 12,
    },
    head: [datos.columnas.map((c) => textoPdf(c.titulo))],
    body: datos.filas.map((fila) => fila.map(textoPdf)),
    theme: "plain",
    styles: {
      font: FUENTE,
      fontSize: 8.5,
      textColor: color.texto,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
      lineColor: color.borde,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: color.primario,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    bodyStyles: { lineWidth: { bottom: 0.5 } },
    alternateRowStyles: { fillColor: [250, 249, 253] },
    columnStyles: Object.fromEntries(
      datos.columnas.map((c, i) => [
        i,
        {
          halign: c.alinear ?? "left",
          ...(c.ancho ? { cellWidth: c.ancho } : {}),
        },
      ])
    ),
    didParseCell: (celda) => {
      if (celda.section === "head") {
        celda.cell.styles.halign =
          datos.columnas[celda.column.index]?.alinear ?? "left"
      }
    },
    didDrawPage: (dibujada) => {
      finalY = dibujada.cursor?.y ?? finalY
    },
  })
  pagina.y = finalY + 10
}

const formatoFechaCorta = (instante: string | null) =>
  instante ? formatearFecha(instante, "corto") : "—"

async function bloqueDetalle(
  doc: jsPDF,
  pagina: Pagina,
  datos: DatosDocumentoSoportePdf
): Promise<void> {
  pagina.tituloSeccion("Detalle de las publicaciones", 60)
  if (datos.lineas.length === 0) {
    pagina.texto("Sin publicaciones en este documento.", {
      tamano: 9,
      peso: "italic",
      tinta: color.secundario,
    })
    pagina.y += SEPARACION
    return
  }
  await tabla(doc, pagina, {
    columnas: [
      { titulo: "#", alinear: "right", ancho: 24 },
      { titulo: "Publicación" },
      { titulo: "Plataforma y formato", ancho: 120 },
      { titulo: "Fecha", ancho: 64 },
      { titulo: "Valor", alinear: "right", ancho: 82 },
    ],
    filas: datos.lineas.map((linea, i) => [
      String(i + 1),
      `${linea.publicacion}\n${linea.marca}`,
      linea.plataformaFormato,
      formatoFechaCorta(linea.fecha),
      formatearCOP(linea.valor),
    ]),
  })
  pagina.y += SEPARACION - 10
}

async function bloqueRetenciones(
  doc: jsPDF,
  pagina: Pagina,
  datos: DatosDocumentoSoportePdf
): Promise<void> {
  pagina.tituloSeccion("Retenciones practicadas", 60)
  if (datos.retenciones.length === 0) {
    pagina.texto("No se practicaron retenciones en este pago.", {
      tamano: 9,
      peso: "italic",
      tinta: color.secundario,
    })
    pagina.y += SEPARACION - 6
    return
  }
  await tabla(doc, pagina, {
    columnas: [
      { titulo: "Retención" },
      { titulo: "Tarifa", alinear: "right", ancho: 82 },
      { titulo: "Base", alinear: "right", ancho: 92 },
      { titulo: "Valor", alinear: "right", ancho: 82 },
    ],
    filas: datos.retenciones.map((retencion) => [
      retencion.nombre,
      retencion.tarifa,
      formatearCOP(retencion.base),
      formatearCOP(retencion.valor),
    ]),
  })
  pagina.y += SEPARACION - 10
}

function bloqueTotales(
  doc: jsPDF,
  pagina: Pagina,
  datos: DatosDocumentoSoportePdf
): void {
  const filas = [
    { etiqueta: "Valor total", valor: datos.valorTotal, fuerte: false },
    {
      etiqueta: "Total retenciones",
      valor: datos.totalRetenciones === 0 ? 0 : -datos.totalRetenciones,
      fuerte: false,
    },
    { etiqueta: "Neto a pagar", valor: datos.netoAPagar, fuerte: true },
  ]
  const ancho = 240
  const x = MARGEN + pagina.anchoUtil - ancho
  const relleno = 10
  const alto = relleno * 2 + filas.length * 18
  pagina.reservar(alto)
  doc.setFillColor(...color.tinte)
  doc.setDrawColor(...color.borde)
  doc.roundedRect(x, pagina.y, ancho, alto, 6, 6, "FD")
  filas.forEach((fila, i) => {
    const y = pagina.y + relleno + i * 18
    const estilo: EstiloTexto = fila.fuerte
      ? { tamano: 11, peso: "bold" }
      : { tamano: 9.5, tinta: color.secundario }
    pagina.estilo(estilo)
    doc.text(textoPdf(fila.etiqueta), x + relleno, y, { baseline: "top" })
    pagina.estilo({ ...estilo, tinta: color.texto })
    doc.text(textoPdf(formatearCOP(fila.valor)), x + ancho - relleno, y, {
      baseline: "top",
      align: "right",
    })
  })
  pagina.y += alto + SEPARACION
}

function bloqueCuds(
  doc: jsPDF,
  pagina: Pagina,
  datos: DatosDocumentoSoportePdf
): void {
  pagina.tituloSeccion("Código único del documento soporte (CUDS)", 30)
  if (datos.cuds) {
    pagina.texto(datos.cuds, { tamano: 8, fuente: "courier" })
  } else {
    pagina.texto(PENDIENTE_TRANSMISION, {
      tamano: 9.5,
      peso: "italic",
      tinta: color.secundario,
    })
  }
  pagina.y += 10
  pagina.texto(
    "Valores en pesos colombianos (COP). Documento generado por la plataforma AMO a partir de la liquidación del periodo.",
    { tamano: 7.5, tinta: color.secundario }
  )
}

function marcaDeAgua(doc: jsPDF): void {
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  doc.saveGraphicsState()
  doc.setGState(doc.GState({ opacity: 0.1 }))
  doc.setFont(FUENTE, "bold")
  doc.setFontSize(44)
  doc.setTextColor(...color.aviso)
  const [linea1, linea2] = MARCA_PRUEBA.split(" — ")
  doc.text(textoPdf(linea1), ancho / 2 - 160, alto / 2 + 150, { angle: 40 })
  doc.text(textoPdf(linea2), ancho / 2 - 120, alto / 2 + 200, { angle: 40 })
  doc.restoreGraphicsState()
}

function encabezadosYPies(
  doc: jsPDF,
  datos: DatosDocumentoSoportePdf,
  logo: ImagenPng | null,
  prueba: boolean,
  generado: Date
): void {
  const total = doc.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  for (let numero = 1; numero <= total; numero++) {
    doc.setPage(numero)
    if (prueba) marcaDeAgua(doc)
    doc.setFillColor(...color.primario)
    doc.rect(0, 0, ancho, 4, "F")
    if (logo) {
      doc.addImage(
        logo.dataUrl,
        "PNG",
        MARGEN,
        22,
        (ALTO_LOGO * logo.ancho) / logo.alto,
        ALTO_LOGO,
        "logo-amo",
        "FAST"
      )
    }
    doc.setFont(FUENTE, "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...color.secundario)
    doc.text(
      textoPdf(`Documento soporte ${datos.numero}`),
      ancho - MARGEN,
      31,
      {
        align: "right",
        baseline: "middle",
      }
    )
    doc.setDrawColor(...color.borde)
    doc.setLineWidth(0.5)
    doc.line(MARGEN, 52, ancho - MARGEN, 52)

    const yPie = alto - ALTO_PIE + 14
    doc.line(MARGEN, yPie - 10, ancho - MARGEN, yPie - 10)
    doc.setFontSize(7.5)
    doc.text(
      textoPdf(`Generado el ${selloGeneracion(generado)} · AMO`),
      MARGEN,
      yPie,
      { baseline: "top" }
    )
    doc.text(`Página ${numero} de ${total}`, ancho - MARGEN, yPie, {
      align: "right",
      baseline: "top",
    })
  }
}

/** Construye el documento en memoria; el servidor lo guarda con `doc.output("arraybuffer")`. */
export async function construirDocumentoSoportePdf(
  datos: DatosDocumentoSoportePdf,
  logo: ImagenPng | null
): Promise<jsPDF> {
  const { jsPDF: JsPdf } = await import("jspdf")
  const doc = new JsPdf({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  })
  const titulo = `Documento soporte ${datos.numero}`
  doc.setProperties({
    title: textoPdf(titulo),
    subject: textoPdf(TITULO_DOCUMENTO_SOPORTE),
    author: AUTOR_DOCUMENTO,
    creator: "AMO",
  })
  doc.setLanguage("es-CO")

  const prueba = esResolucionDePrueba(datos.resolucion)
  const pagina = new Pagina(doc)
  bloqueTitulo(doc, pagina, datos, prueba)
  bloquePartes(doc, pagina, datos)
  await bloqueDetalle(doc, pagina, datos)
  await bloqueRetenciones(doc, pagina, datos)
  bloqueTotales(doc, pagina, datos)
  bloqueCuds(doc, pagina, datos)

  encabezadosYPies(doc, datos, logo, prueba, datos.generadoAt ?? new Date())
  return doc
}
