// @vitest-environment node
import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"

import {
  anchoColumna,
  construirLibroExcel,
  FILA_ENCABEZADO,
  FORMATO_NUMERICO,
  type HojaExcel,
  letraColumna,
  type LibroExcel,
  NOMBRE_PORTADA,
  nombresUnicos,
} from "./excel"
import { TEXTO_CONFIDENCIAL } from "./marca"

const FECHA = new Date("2026-09-30T20:05:00Z")
/** PNG de 1 × 1 px. */
const LOGO = {
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  ancho: 300,
  alto: 100,
}

const HOJA: HojaExcel = {
  nombre: "Medios",
  titulo: "Cumplimiento de medios",
  descripcion: "Periodo: septiembre de 2026",
  columnas: [
    { titulo: "Medio" },
    { titulo: "GMV", formato: "cop", totalizar: true },
    { titulo: "Cumplimiento", formato: "porcentaje" },
    { titulo: "Verificado", formato: "fecha" },
  ],
  filas: [
    ["Eco Tunja", 12_500_000, 0.92, new Date("2026-09-15T15:00:00Z")],
    ["Radio Neiva", 8_000_000, 0.81, null],
    ["Sin dato", Number.NaN, undefined, true],
  ],
}

const LIBRO: LibroExcel = {
  titulo: "Reporte de cumplimiento",
  subtitulo: "Medios verificados",
  filtros: [
    { etiqueta: "Periodo", valor: "1–30 sept 2026" },
    { etiqueta: "Departamento", valor: "Todos" },
  ],
  hojas: [HOJA, { ...HOJA, titulo: undefined, descripcion: undefined }],
  generadoPor: "Ana Operaciones",
  fecha: FECHA,
}

async function libroReleido() {
  const libro = await construirLibroExcel(LIBRO, LOGO)
  const buffer = await libro.xlsx.writeBuffer()
  const leido = new ExcelJS.Workbook()
  await leido.xlsx.load(buffer as ArrayBuffer)
  return { libro, leido }
}

describe("construirLibroExcel", () => {
  it("abre con la portada de marca y nombres de hoja únicos", async () => {
    const { leido } = await libroReleido()
    expect(leido.worksheets.map((h) => h.name)).toEqual([
      NOMBRE_PORTADA,
      "Medios",
      "Medios (2)",
    ])
    expect(leido.creator).toBe("AMO — Advertising Market Optimization")
  })

  it("la portada lleva logo, título, filtros, sello en hora de Bogotá e índice", async () => {
    const { libro } = await libroReleido()
    const portada = libro.getWorksheet(NOMBRE_PORTADA)
    const textos: string[] = []
    portada?.eachRow((fila) =>
      fila.eachCell((celda) => {
        const valor = celda.value
        textos.push(
          typeof valor === "object" && valor && "text" in valor
            ? String(valor.text)
            : String(valor)
        )
      })
    )
    expect(portada?.getImages()).toHaveLength(1)
    expect(textos).toEqual(
      expect.arrayContaining([
        "Reporte de cumplimiento",
        "Medios verificados",
        "FILTROS APLICADOS",
        "Periodo",
        "1–30 sept 2026",
        "Generado por",
        "Ana Operaciones",
        "Medios (2)",
        TEXTO_CONFIDENCIAL,
      ])
    )
    const sello = textos.find((t) => t.includes("hora de Bogotá")) ?? ""
    expect(sello.replace(/[\u00a0\u202f]/g, " ")).toMatch(
      /^30 de septiembre de 2026(,| a las) 3:05 p\. ?m\. \(hora de Bogotá\)$/
    )
  })

  it("sin logo la portada se genera igual", async () => {
    const libro = await construirLibroExcel(LIBRO, null)
    expect(libro.getWorksheet(NOMBRE_PORTADA)?.getImages()).toHaveLength(0)
  })

  it("las hojas de datos tienen encabezado lila, formatos, filtros y paneles", async () => {
    const { leido } = await libroReleido()
    const hoja = leido.getWorksheet("Medios")
    expect(hoja?.getCell("A1").value).toBe("Cumplimiento de medios")
    expect(hoja?.getCell("A2").value).toBe("Periodo: septiembre de 2026")

    const encabezado = hoja?.getRow(FILA_ENCABEZADO)
    expect(encabezado?.getCell(1).value).toBe("Medio")
    expect(encabezado?.getCell(2).fill).toMatchObject({
      pattern: "solid",
      fgColor: { argb: "FF7549DE" },
    })
    expect(encabezado?.getCell(2).font).toMatchObject({
      bold: true,
      color: { argb: "FFFFFFFF" },
    })

    const primera = hoja?.getRow(FILA_ENCABEZADO + 1)
    expect(primera?.getCell(2).numFmt).toBe(FORMATO_NUMERICO.cop)
    expect(primera?.getCell(3).numFmt).toBe(FORMATO_NUMERICO.porcentaje)
    expect(primera?.getCell(4).numFmt).toBe(FORMATO_NUMERICO.fecha)
    expect(primera?.getCell(4).value).toBeInstanceOf(Date)

    // ExcelJS lo relee como rango: encabezado (fila 4) a la última fila de datos.
    expect(hoja?.autoFilter).toBe("A4:D7")
    expect(hoja?.views[0]).toMatchObject({
      state: "frozen",
      ySplit: FILA_ENCABEZADO,
      xSplit: 1,
    })
    expect(hoja?.headerFooter?.oddFooter).toContain("Página &P de &N")
  })

  it("normaliza valores: NaN y vacíos a celda vacía, booleanos a Sí/No", async () => {
    const { leido } = await libroReleido()
    const fila = leido.getWorksheet("Medios")?.getRow(FILA_ENCABEZADO + 3)
    expect(fila?.getCell(2).value).toBeNull()
    expect(fila?.getCell(3).value).toBeNull()
    expect(fila?.getCell(4).value).toBe("Sí")
  })

  it("la fila de totales usa SUBTOTAL (respeta el filtro) con el resultado calculado", async () => {
    const { leido } = await libroReleido()
    const total = leido.getWorksheet("Medios")?.getRow(FILA_ENCABEZADO + 4)
    expect(total?.getCell(1).value).toBe("Total")
    expect(total?.getCell(2).value).toMatchObject({
      formula: "SUBTOTAL(109,B5:B7)",
      result: 20_500_000,
    })
    expect(total?.getCell(3).value).toBeNull()
  })
})

describe("utilidades del libro", () => {
  it("letraColumna cubre A…Z y AA…", () => {
    expect([1, 26, 27, 28, 52, 703].map(letraColumna)).toEqual([
      "A",
      "Z",
      "AA",
      "AB",
      "AZ",
      "AAA",
    ])
  })

  it("nombresUnicos respeta el límite de 31 caracteres y los reservados", () => {
    const largo = "Resumen ejecutivo por departamento y municipio"
    const nombres = nombresUnicos(
      ["Portada", largo, largo, "Datos/Mes"],
      ["Portada"]
    )
    expect(nombres[0]).toBe("Portada (2)")
    expect(nombres[1].length).toBeLessThanOrEqual(31)
    expect(nombres[2].endsWith(" (2)")).toBe(true)
    expect(nombres[2].length).toBeLessThanOrEqual(31)
    expect(nombres[3]).not.toContain("/")
    expect(new Set(nombres).size).toBe(4)
  })

  it("anchoColumna crece con el contenido dentro de un rango", () => {
    expect(anchoColumna(HOJA, 0)).toBe(14)
    expect(anchoColumna(HOJA, 1)).toBeGreaterThanOrEqual(15)
    const fija: HojaExcel = { ...HOJA, columnas: [{ titulo: "X", ancho: 42 }] }
    expect(anchoColumna(fija, 0)).toBe(42)
    const larga: HojaExcel = {
      nombre: "L",
      columnas: [{ titulo: "T" }],
      filas: [["x".repeat(200)]],
    }
    expect(anchoColumna(larga, 0)).toBe(60)
  })
})
