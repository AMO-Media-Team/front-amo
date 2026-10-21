/**
 * Exportación de la vista de una tabla a CSV y Excel, en el navegador. El CSV
 * es puro (se prueba sin DOM); ExcelJS (~1 MB) se importa solo al hacer clic.
 * Las fechas se escriben con la hora de Bogotá, igual que en pantalla.
 */

export type ValorExportable =
  string | number | boolean | Date | null | undefined

export type FormatoColumna = "texto" | "numero" | "fecha" | "fechaHora"

export interface ColumnaExportable {
  titulo: string
  formato?: FormatoColumna
}

export interface DatosExportacion {
  /** Título de la hoja de Excel y del documento. */
  titulo: string
  columnas: readonly ColumnaExportable[]
  filas: readonly (readonly ValorExportable[])[]
}

export type FormatoExportacion = "csv" | "xlsx"

const BOM = "﻿"
// Excel en configuración regional es-CO usa ";" como separador de listas.
const SEPARADOR = ";"
const FIN_LINEA = "\r\n"
/** Colombia no tiene horario de verano: UTC−5 todo el año. */
const DESFASE_BOGOTA_MS = -5 * 60 * 60 * 1000
const MIME = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const satisfies Record<FormatoExportacion, string>

/** Celdas que Excel interpretaría como fórmula (inyección CSV, OWASP). */
const INICIO_FORMULA = /^[=+\-@\t\r]/

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, "0")
}

/** Fecha y hora de Bogotá como "2026-09-30 14:05" (ordenable y legible). */
export function fechaHoraBogota(fecha: Date, conHora = true): string {
  const local = new Date(fecha.getTime() + DESFASE_BOGOTA_MS)
  const dia = `${local.getUTCFullYear()}-${dosDigitos(local.getUTCMonth() + 1)}-${dosDigitos(local.getUTCDate())}`
  return conHora
    ? `${dia} ${dosDigitos(local.getUTCHours())}:${dosDigitos(local.getUTCMinutes())}`
    : dia
}

/**
 * ExcelJS guarda las fechas en UTC y Excel las muestra tal cual: se desplazan
 * para que la celda muestre la hora de Bogotá.
 */
export function fechaParaExcel(fecha: Date): Date {
  return new Date(fecha.getTime() + DESFASE_BOGOTA_MS)
}

function textoCelda(valor: ValorExportable, formato?: FormatoColumna): string {
  if (valor === null || valor === undefined) return ""
  if (valor instanceof Date) return fechaHoraBogota(valor, formato !== "fecha")
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  if (typeof valor === "number")
    return Number.isFinite(valor) ? String(valor) : ""
  return INICIO_FORMULA.test(valor) ? `'${valor}` : valor
}

function celdaCsv(texto: string): string {
  return /[";\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

/** CSV con BOM (Excel detecta UTF-8), separador ";" y fin de línea CRLF. */
export function aCsv({ columnas, filas }: DatosExportacion): string {
  const lineas = [
    columnas.map((columna) => celdaCsv(textoCelda(columna.titulo))),
    ...filas.map((fila) =>
      columnas.map((columna, indice) =>
        celdaCsv(textoCelda(fila[indice], columna.formato))
      )
    ),
  ]
  return BOM + lineas.map((celdas) => celdas.join(SEPARADOR)).join(FIN_LINEA)
}

/** "Usuarios AMO" + fecha → "usuarios-amo-2026-09-30". */
export function nombreArchivoExportacion(
  base: string,
  fecha = new Date()
): string {
  const limpio = base
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `${limpio || "exportacion"}-${fechaHoraBogota(fecha, false)}`
}

/** Nombre de hoja válido en Excel: ≤ 31 caracteres y sin `[]:*?/\`. */
export function nombreHoja(titulo: string): string {
  const limpio = titulo
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return limpio.slice(0, 31) || "Datos"
}

function descargar(contenido: BlobPart, nombre: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const enlace = document.createElement("a")
  enlace.href = url
  enlace.download = nombre
  enlace.rel = "noopener"
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  // Tras el clic el navegador ya tomó el Blob; se libera en el siguiente ciclo.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const COLOR_ENCABEZADO = "FF7549DE"
const ANCHO_MINIMO = 10
const ANCHO_MAXIMO = 48

function anchoColumna(datos: DatosExportacion, indice: number): number {
  const longitudes = [
    datos.columnas[indice].titulo.length,
    ...datos.filas.map(
      (fila) => textoCelda(fila[indice], datos.columnas[indice].formato).length
    ),
  ]
  return Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, ...longitudes) + 2)
}

const FORMATO_NUMERICO: Partial<Record<FormatoColumna, string>> = {
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
  numero: "#,##0",
}

function valorExcel(valor: ValorExportable): string | number | Date | null {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return fechaParaExcel(valor)
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  if (typeof valor === "string" && INICIO_FORMULA.test(valor))
    return `'${valor}`
  return valor
}

async function construirExcel(datos: DatosExportacion): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs")
  const libro = new ExcelJS.Workbook()
  libro.creator = "AMO"
  libro.created = new Date()
  const hoja = libro.addWorksheet(nombreHoja(datos.titulo), {
    views: [{ state: "frozen", ySplit: 1 }],
  })
  hoja.columns = datos.columnas.map((columna, indice) => ({
    header: columna.titulo,
    width: anchoColumna(datos, indice),
    style: columna.formato
      ? { numFmt: FORMATO_NUMERICO[columna.formato] }
      : undefined,
  }))
  for (const fila of datos.filas) hoja.addRow(fila.map(valorExcel))

  const encabezado = hoja.getRow(1)
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } }
  encabezado.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_ENCABEZADO },
  }
  encabezado.alignment = { vertical: "middle" }
  hoja.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: datos.columnas.length },
  }
  return libro.xlsx.writeBuffer()
}

/** Genera el archivo en el navegador y lo descarga. */
export async function exportarDatos(
  datos: DatosExportacion,
  formato: FormatoExportacion,
  nombreBase: string
): Promise<void> {
  const nombre = `${nombreArchivoExportacion(nombreBase)}.${formato}`
  const contenido =
    formato === "csv" ? aCsv(datos) : await construirExcel(datos)
  descargar(contenido, nombre, MIME[formato])
}
