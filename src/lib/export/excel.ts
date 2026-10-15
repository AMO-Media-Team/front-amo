/**
 * Libro de Excel con marca AMO (ExcelJS, ~1 MB, se importa solo al exportar):
 * portada con logo, título, filtros, sello de generación en hora de Bogotá e
 * índice enlazado; hojas de datos con encabezado lila, formatos COP,
 * porcentaje y fecha, anchos calculados, filtros automáticos, paneles
 * inmovilizados, totales que respetan el filtro y pie de impresión.
 */
import type { Workbook, Worksheet } from "exceljs"

import { fechaParaExcel, nombreHoja } from "@/components/data-table/exportar"

import { descargarArchivo, MIME, nombreArchivo } from "./descarga"
import { cargarLogoMarca, type ImagenPng } from "./logo"
import {
  argb,
  AUTOR_DOCUMENTO,
  COLOR_DOCUMENTO,
  type FiltroDocumento,
  selloGeneracion,
  TEXTO_CONFIDENCIAL,
} from "./marca"

export type FormatoCelda =
  | "texto"
  | "numero"
  | "decimal"
  | "cop"
  /** Fracción: 0,125 se muestra 12,5 %. */
  | "porcentaje"
  | "fecha"
  | "fechaHora"

export type ValorCelda = string | number | boolean | Date | null | undefined

export interface ColumnaExcel {
  titulo: string
  formato?: FormatoCelda
  /** Ancho en caracteres; por defecto se calcula con el contenido. */
  ancho?: number
  /** Suma la columna en una fila de totales (SUBTOTAL: respeta el filtro). */
  totalizar?: boolean
}

export interface HojaExcel {
  nombre: string
  titulo?: string
  descripcion?: string
  columnas: readonly ColumnaExcel[]
  filas: readonly (readonly ValorCelda[])[]
}

export interface LibroExcel {
  titulo: string
  subtitulo?: string
  filtros?: readonly FiltroDocumento[]
  hojas: readonly HojaExcel[]
  generadoPor?: string
  fecha?: Date
}

export const NOMBRE_PORTADA = "Portada"
/** Filas 1–3: título, descripción y aire; la 4 es el encabezado de la tabla. */
export const FILA_ENCABEZADO = 4
const FUENTE = "Calibri"
const ANCHO_MINIMO = 10
const ANCHO_MAXIMO = 60
const ANCHO_LOGO = 240

export const FORMATO_NUMERICO: Readonly<
  Record<FormatoCelda, string | undefined>
> = {
  texto: undefined,
  numero: "#,##0",
  decimal: "#,##0.00",
  cop: '"$" #,##0;-"$" #,##0',
  porcentaje: "0.0%",
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
}

function valorExcel(valor: ValorCelda): string | number | Date | null {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return fechaParaExcel(valor)
  if (typeof valor === "boolean") return valor ? "Sí" : "No"
  if (typeof valor === "number" && !Number.isFinite(valor)) return null
  return valor
}

function longitudVisible(
  valor: ValorCelda,
  formato: FormatoCelda | undefined
): number {
  if (valor === null || valor === undefined) return 0
  if (valor instanceof Date) return formato === "fechaHora" ? 16 : 10
  if (typeof valor === "number") {
    // Separadores de miles, signo y símbolo de moneda.
    const digitos = Math.trunc(Math.abs(valor)).toString().length
    return (
      digitos +
      Math.floor((digitos - 1) / 3) +
      (formato === "cop" ? 3 : 1) +
      (formato === "decimal" || formato === "porcentaje" ? 3 : 0)
    )
  }
  return String(valor).length
}

export function anchoColumna(hoja: HojaExcel, indice: number): number {
  const columna = hoja.columnas[indice]
  if (columna.ancho) return columna.ancho
  const maximo = Math.max(
    columna.titulo.length,
    ...hoja.filas.map((fila) => longitudVisible(fila[indice], columna.formato))
  )
  return Math.min(ANCHO_MAXIMO, Math.max(ANCHO_MINIMO, maximo + 3))
}

/** Nombres de hoja válidos y únicos ("Datos", "Datos (2)"). */
export function nombresUnicos(
  nombres: readonly string[],
  reservados: readonly string[] = []
): string[] {
  const usados = new Set(reservados.map((n) => n.toLowerCase()))
  return nombres.map((original) => {
    const base = nombreHoja(original)
    let candidato = base
    for (let n = 2; usados.has(candidato.toLowerCase()); n++) {
      const sufijo = ` (${n})`
      candidato = `${base.slice(0, 31 - sufijo.length)}${sufijo}`
    }
    usados.add(candidato.toLowerCase())
    return candidato
  })
}

/** Letra de columna de Excel (1 → A, 28 → AB). */
export function letraColumna(numero: number): string {
  let letra = ""
  for (let n = numero; n > 0; n = Math.floor((n - 1) / 26)) {
    letra = String.fromCharCode(65 + ((n - 1) % 26)) + letra
  }
  return letra
}

function enlaceInterno(hoja: string): string {
  return `#'${hoja.replaceAll("'", "''")}'!A1`
}

function escribirPortada(
  libro: Workbook,
  datos: LibroExcel,
  nombresHojas: readonly string[],
  logo: ImagenPng | null,
  fecha: Date
): Worksheet {
  const hoja = libro.addWorksheet(NOMBRE_PORTADA, {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: argb(COLOR_DOCUMENTO.primario) } },
  })
  hoja.columns = [{ width: 3 }, { width: 24 }, { width: 70 }]

  // Franja de acento de la marca.
  hoja.getRow(1).height = 6
  for (const columna of ["A", "B", "C"]) {
    hoja.getCell(`${columna}1`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(COLOR_DOCUMENTO.primario) },
    }
  }

  if (logo) {
    const imagen = libro.addImage({ base64: logo.dataUrl, extension: "png" })
    hoja.addImage(imagen, {
      tl: { col: 1, row: 2 },
      ext: {
        width: ANCHO_LOGO,
        height: Math.round((ANCHO_LOGO * logo.alto) / logo.ancho),
      },
    })
  }

  let fila = 7
  const titulo = hoja.getCell(`B${fila}`)
  titulo.value = datos.titulo
  titulo.font = {
    name: FUENTE,
    size: 22,
    bold: true,
    color: { argb: argb(COLOR_DOCUMENTO.primarioProfundo) },
  }
  hoja.mergeCells(`B${fila}:C${fila}`)
  hoja.getRow(fila).height = 32
  fila++

  if (datos.subtitulo) {
    const subtitulo = hoja.getCell(`B${fila}`)
    subtitulo.value = datos.subtitulo
    subtitulo.font = {
      name: FUENTE,
      size: 12,
      color: { argb: argb(COLOR_DOCUMENTO.textoSecundario) },
    }
    hoja.mergeCells(`B${fila}:C${fila}`)
    fila++
  }
  fila++

  const seccion = (texto: string) => {
    const celda = hoja.getCell(`B${fila}`)
    celda.value = texto.toUpperCase()
    celda.font = {
      name: FUENTE,
      size: 9,
      bold: true,
      color: { argb: argb(COLOR_DOCUMENTO.primario) },
    }
    for (const columna of ["B", "C"]) {
      hoja.getCell(`${columna}${fila}`).border = {
        bottom: { style: "thin", color: { argb: argb(COLOR_DOCUMENTO.borde) } },
      }
    }
    fila++
  }
  const dato = (
    etiqueta: string,
    valor: string | { text: string; hyperlink: string }
  ) => {
    const celdaEtiqueta = hoja.getCell(`B${fila}`)
    celdaEtiqueta.value = etiqueta
    celdaEtiqueta.font = {
      name: FUENTE,
      size: 11,
      color: { argb: argb(COLOR_DOCUMENTO.textoSecundario) },
    }
    const celdaValor = hoja.getCell(`C${fila}`)
    celdaValor.value = valor
    celdaValor.font =
      typeof valor === "string"
        ? {
            name: FUENTE,
            size: 11,
            color: { argb: argb(COLOR_DOCUMENTO.texto) },
          }
        : {
            name: FUENTE,
            size: 11,
            underline: true,
            color: { argb: argb(COLOR_DOCUMENTO.primario) },
          }
    celdaValor.alignment = { wrapText: true, vertical: "top" }
    fila++
  }

  if (datos.filtros?.length) {
    seccion("Filtros aplicados")
    for (const filtro of datos.filtros) dato(filtro.etiqueta, filtro.valor)
    fila++
  }

  seccion("Generación")
  dato("Generado el", selloGeneracion(fecha))
  if (datos.generadoPor) dato("Generado por", datos.generadoPor)
  dato("Fuente", AUTOR_DOCUMENTO)
  fila++

  seccion("Contenido")
  nombresHojas.forEach((nombre, i) =>
    dato(`Hoja ${i + 1}`, { text: nombre, hyperlink: enlaceInterno(nombre) })
  )
  fila++

  const nota = hoja.getCell(`B${fila}`)
  nota.value = TEXTO_CONFIDENCIAL
  nota.font = {
    name: FUENTE,
    size: 9,
    italic: true,
    color: { argb: argb(COLOR_DOCUMENTO.textoSecundario) },
  }
  hoja.mergeCells(`B${fila}:C${fila}`)
  return hoja
}

function escribirHoja(
  libro: Workbook,
  datos: HojaExcel,
  nombre: string
): Worksheet {
  const columnas = datos.columnas.length
  const hoja = libro.addWorksheet(nombre, {
    views: [
      {
        state: "frozen",
        ySplit: FILA_ENCABEZADO,
        xSplit: 1,
        showGridLines: false,
      },
    ],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${FILA_ENCABEZADO}:${FILA_ENCABEZADO}`,
    },
    headerFooter: {
      oddFooter: `&L&8${TEXTO_CONFIDENCIAL}&R&8Página &P de &N`,
    },
  })

  datos.columnas.forEach((columna, i) => {
    hoja.getColumn(i + 1).width = anchoColumna(datos, i)
  })

  const titulo = hoja.getCell("A1")
  titulo.value = datos.titulo ?? datos.nombre
  titulo.font = {
    name: FUENTE,
    size: 14,
    bold: true,
    color: { argb: argb(COLOR_DOCUMENTO.primarioProfundo) },
  }
  if (datos.descripcion) {
    const descripcion = hoja.getCell("A2")
    descripcion.value = datos.descripcion
    descripcion.font = {
      name: FUENTE,
      size: 10,
      color: { argb: argb(COLOR_DOCUMENTO.textoSecundario) },
    }
  }

  const encabezado = hoja.getRow(FILA_ENCABEZADO)
  encabezado.values = datos.columnas.map((c) => c.titulo)
  encabezado.height = 24
  encabezado.eachCell((celda, numero) => {
    const numerica = (datos.columnas[numero - 1].formato ?? "texto") !== "texto"
    celda.font = {
      name: FUENTE,
      size: 11,
      bold: true,
      color: { argb: argb(COLOR_DOCUMENTO.blanco) },
    }
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(COLOR_DOCUMENTO.primario) },
    }
    celda.alignment = {
      vertical: "middle",
      horizontal: numerica ? "right" : "left",
      wrapText: true,
    }
  })

  datos.filas.forEach((valores, indiceFila) => {
    const fila = hoja.getRow(FILA_ENCABEZADO + 1 + indiceFila)
    fila.values = valores.map(valorExcel)
    datos.columnas.forEach((columna, i) => {
      const celda = fila.getCell(i + 1)
      celda.font = {
        name: FUENTE,
        size: 11,
        color: { argb: argb(COLOR_DOCUMENTO.texto) },
      }
      const formato = FORMATO_NUMERICO[columna.formato ?? "texto"]
      if (formato) celda.numFmt = formato
      celda.border = {
        bottom: { style: "hair", color: { argb: argb(COLOR_DOCUMENTO.borde) } },
      }
    })
  })

  const ultimaFila = FILA_ENCABEZADO + datos.filas.length
  if (columnas > 0) {
    hoja.autoFilter = {
      from: { row: FILA_ENCABEZADO, column: 1 },
      to: { row: Math.max(ultimaFila, FILA_ENCABEZADO), column: columnas },
    }
  }

  if (datos.columnas.some((c) => c.totalizar) && datos.filas.length > 0) {
    escribirTotales(hoja, datos, ultimaFila)
  }
  return hoja
}

function escribirTotales(
  hoja: Worksheet,
  datos: HojaExcel,
  ultimaFila: number
): void {
  const fila = hoja.getRow(ultimaFila + 1)
  fila.getCell(1).value = "Total"
  datos.columnas.forEach((columna, i) => {
    const celda = fila.getCell(i + 1)
    celda.font = {
      name: FUENTE,
      size: 11,
      bold: true,
      color: { argb: argb(COLOR_DOCUMENTO.texto) },
    }
    celda.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(COLOR_DOCUMENTO.tinte) },
    }
    celda.border = {
      top: { style: "thin", color: { argb: argb(COLOR_DOCUMENTO.primario) } },
    }
    if (!columna.totalizar) return
    const letra = letraColumna(i + 1)
    const suma = datos.filas.reduce((total, valores) => {
      const valor = valores[i]
      return (
        total +
        (typeof valor === "number" && Number.isFinite(valor) ? valor : 0)
      )
    }, 0)
    // 109 = SUMA que ignora las filas ocultas por el filtro automático.
    celda.value = {
      formula: `SUBTOTAL(109,${letra}${FILA_ENCABEZADO + 1}:${letra}${ultimaFila})`,
      result: suma,
    }
    const formato = FORMATO_NUMERICO[columna.formato ?? "numero"]
    if (formato) celda.numFmt = formato
  })
}

/** Construye el libro en memoria (sin descargar): lo usan la exportación y las pruebas. */
export async function construirLibroExcel(
  datos: LibroExcel,
  logo: ImagenPng | null
): Promise<Workbook> {
  const { default: ExcelJS } = await import("exceljs")
  const fecha = datos.fecha ?? new Date()
  const libro = new ExcelJS.Workbook()
  libro.creator = AUTOR_DOCUMENTO
  libro.company = "AMO"
  libro.title = datos.titulo
  libro.created = fecha

  const nombres = nombresUnicos(
    datos.hojas.map((hoja) => hoja.nombre),
    [NOMBRE_PORTADA]
  )
  escribirPortada(libro, datos, nombres, logo, fecha)
  datos.hojas.forEach((hoja, i) => escribirHoja(libro, hoja, nombres[i]))
  return libro
}

/** Genera el libro (con logo si carga) y lo descarga. */
export async function exportarExcel(
  datos: LibroExcel,
  nombreBase = datos.titulo
): Promise<void> {
  const logo = await cargarLogoMarca()
  const libro = await construirLibroExcel(datos, logo)
  const contenido = await libro.xlsx.writeBuffer()
  descargarArchivo(
    contenido as ArrayBuffer,
    nombreArchivo(nombreBase, "xlsx"),
    MIME.xlsx
  )
}
