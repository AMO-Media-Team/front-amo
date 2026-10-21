import { describe, expect, it } from "vitest"

import {
  aCsv,
  fechaHoraBogota,
  fechaParaExcel,
  nombreArchivoExportacion,
  nombreHoja,
} from "./exportar"

const LINEAS = (csv: string) => csv.slice(1).split("\r\n")

describe("aCsv", () => {
  it("empieza con BOM y separa con punto y coma y CRLF", () => {
    const csv = aCsv({
      titulo: "Usuarios",
      columnas: [{ titulo: "Nombre" }, { titulo: "Correo" }],
      filas: [["Ana Gómez", "ana@amo.test"]],
    })
    expect(csv.startsWith("﻿")).toBe(true)
    expect(LINEAS(csv)).toEqual(["Nombre;Correo", "Ana Gómez;ana@amo.test"])
  })

  it("entrecomilla separadores, comillas y saltos de línea", () => {
    const csv = aCsv({
      titulo: "t",
      columnas: [{ titulo: "Nota" }],
      filas: [['dice "hola"; adiós'], ["dos\nlíneas"]],
    })
    expect(csv.slice(1)).toBe('Nota\r\n"dice ""hola""; adiós"\r\n"dos\nlíneas"')
  })

  it("neutraliza celdas que Excel ejecutaría como fórmula", () => {
    const csv = aCsv({
      titulo: "t",
      columnas: [{ titulo: "Nombre" }],
      filas: [['=HYPERLINK("x")'], ["+57 300"], ["@SUMA"], ["-1"]],
    })
    expect(LINEAS(csv).slice(1)).toEqual([
      '"\'=HYPERLINK(""x"")"',
      "'+57 300",
      "'@SUMA",
      "'-1",
    ])
  })

  it("convierte fechas a hora de Bogotá, booleanos a Sí/No y vacíos a nada", () => {
    const instante = new Date("2026-09-30T19:05:00Z")
    const csv = aCsv({
      titulo: "t",
      columnas: [
        { titulo: "Creado", formato: "fechaHora" },
        { titulo: "Día", formato: "fecha" },
        { titulo: "MFA" },
        { titulo: "Último acceso" },
        { titulo: "Total", formato: "numero" },
      ],
      filas: [[instante, instante, true, null, 1234]],
    })
    expect(LINEAS(csv)[1]).toBe("2026-09-30 14:05;2026-09-30;Sí;;1234")
  })
})

describe("fechas", () => {
  it("usa la fecha civil de Bogotá (UTC−5) aunque en UTC ya sea el día siguiente", () => {
    expect(fechaHoraBogota(new Date("2026-10-01T03:30:00Z"))).toBe(
      "2026-09-30 22:30"
    )
  })

  it("desplaza la fecha de Excel para que la celda muestre la hora local", () => {
    expect(fechaParaExcel(new Date("2026-09-30T19:05:00Z")).toISOString()).toBe(
      "2026-09-30T14:05:00.000Z"
    )
  })
})

describe("nombres", () => {
  it("genera un nombre de archivo seguro con la fecha de Bogotá", () => {
    expect(
      nombreArchivoExportacion(
        "Usuarios · Administración",
        new Date("2026-10-01T02:00:00Z")
      )
    ).toBe("usuarios-administracion-2026-09-30")
    expect(
      nombreArchivoExportacion("***", new Date("2026-09-30T12:00:00Z"))
    ).toBe("exportacion-2026-09-30")
  })

  it("limpia el nombre de hoja según las reglas de Excel", () => {
    expect(nombreHoja("Usuarios [activos]: 2026/09")).toBe(
      "Usuarios activos 2026 09"
    )
    expect(nombreHoja("x".repeat(40))).toHaveLength(31)
    expect(nombreHoja("///")).toBe("Datos")
  })
})
