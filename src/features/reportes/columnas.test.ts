import { describe, expect, it } from "vitest"

import {
  alineaComoNumero,
  cifraSinCorte,
  type ColumnaReporte,
  columnasExcel,
  columnasPdf,
  esNumerica,
  filasExcel,
  filasPdf,
  formatearCelda,
  valorExcel,
} from "./columnas"

interface Fila {
  nombre: string
  gmv: number | null
  tasa: number | null
  activo: boolean
  visto: string | null
}

const FILA: Fila = {
  nombre: "Rionegro Hoy",
  gmv: 1_250_000,
  tasa: 0.125,
  activo: true,
  visto: "2026-09-30T20:05:00Z",
}

const COLUMNAS: readonly ColumnaReporte<Fila>[] = [
  { id: "nombre", titulo: "Medio", tipo: "texto", valor: (f) => f.nombre },
  {
    id: "gmv",
    titulo: "GMV",
    tipo: "cop",
    valor: (f) => f.gmv,
    totalizar: true,
  },
  {
    id: "tasa",
    titulo: "Cumplimiento",
    tipo: "porcentaje",
    valor: (f) => f.tasa,
  },
  { id: "activo", titulo: "Activo", tipo: "booleano", valor: (f) => f.activo },
  {
    id: "visto",
    titulo: "Último acceso",
    tipo: "fechaHora",
    valor: (f) => f.visto,
    enPdf: false,
  },
]

/** Los formatos de Intl usan espacios duros: se comparan como espacios normales. */
const plano = (texto: string) => texto.replace(/[  ]/g, " ")

describe("formatearCelda", () => {
  it("formatea cada tipo en es-CO", () => {
    expect(formatearCelda("Cali al Día", "texto")).toBe("Cali al Día")
    expect(formatearCelda(1_234_567, "entero")).toBe("1.234.567")
    expect(plano(formatearCelda(1_250_000, "cop"))).toBe("$ 1.250.000")
    expect(plano(formatearCelda(0.125, "porcentaje"))).toMatch(/^12,5\s?%$/)
    expect(formatearCelda(true, "booleano")).toBe("Sí")
    expect(formatearCelda(false, "booleano")).toBe("No")
  })

  it("los decimales llevan siempre dos cifras (columnas alineadas)", () => {
    expect(formatearCelda(0.8, "decimal")).toBe("0,80")
    expect(formatearCelda(1, "decimal")).toBe("1,00")
    expect(formatearCelda(1234.567, "decimal")).toBe("1.234,57")
  })

  it("las fechas salen en hora de Bogotá aunque el servidor esté en UTC", () => {
    // 01:30 UTC del 1 de octubre = 20:30 del 30 de septiembre en Bogotá.
    expect(formatearCelda("2026-10-01T01:30:00Z", "fecha")).toContain(
      "30 de sept"
    )
    expect(plano(formatearCelda("2026-10-01T01:30:00Z", "fechaHora"))).toMatch(
      /30 de sept de 2026, 8:30 p\. m\./
    )
  })

  it("lo vacío o no numérico se muestra como raya", () => {
    expect(formatearCelda(null, "cop")).toBe("—")
    expect(formatearCelda("", "texto")).toBe("—")
    expect(formatearCelda("abc", "entero")).toBe("—")
    expect(formatearCelda(Number.NaN, "porcentaje")).toBe("—")
  })

  it("un cero es un dato, no un vacío", () => {
    expect(formatearCelda(0, "entero")).toBe("0")
    expect(plano(formatearCelda(0, "cop"))).toBe("$ 0")
  })
})

describe("valorExcel", () => {
  it("conserva números reales y convierte fechas y booleanos", () => {
    expect(valorExcel(1_250_000, "cop")).toBe(1_250_000)
    expect(valorExcel(0.125, "porcentaje")).toBe(0.125)
    expect(valorExcel(true, "booleano")).toBe("Sí")
    expect(valorExcel(false, "booleano")).toBe("No")
    const fecha = valorExcel("2026-09-30T20:05:00Z", "fechaHora")
    expect(fecha).toBeInstanceOf(Date)
    expect((fecha as Date).toISOString()).toBe("2026-09-30T20:05:00.000Z")
  })

  it("lo vacío queda vacío y una fecha ilegible, como texto", () => {
    expect(valorExcel(null, "entero")).toBeNull()
    expect(valorExcel("", "texto")).toBeNull()
    expect(valorExcel("pronto", "fecha")).toBe("pronto")
  })
})

describe("alineación", () => {
  it("las cifras y los textos con cifras se alinean como números", () => {
    expect(esNumerica("cop")).toBe(true)
    expect(esNumerica("texto")).toBe(false)
    expect(esNumerica("booleano")).toBe(false)
    expect(alineaComoNumero({ tipo: "porcentaje" })).toBe(true)
    expect(alineaComoNumero({ tipo: "texto", cifras: true })).toBe(true)
    expect(alineaComoNumero({ tipo: "texto" })).toBe(false)
  })
})

describe("exportación", () => {
  it("el Excel recibe todas las columnas con su formato y sus totales", () => {
    expect(columnasExcel(COLUMNAS)).toEqual([
      { titulo: "Medio", formato: "texto", totalizar: undefined },
      { titulo: "GMV", formato: "cop", totalizar: true },
      { titulo: "Cumplimiento", formato: "porcentaje", totalizar: undefined },
      { titulo: "Activo", formato: "texto", totalizar: undefined },
      { titulo: "Último acceso", formato: "fechaHora", totalizar: undefined },
    ])
    const [fila] = filasExcel(COLUMNAS, [FILA])
    expect(fila.slice(0, 4)).toEqual(["Rionegro Hoy", 1_250_000, 0.125, "Sí"])
    expect(fila[4]).toBeInstanceOf(Date)
  })

  it("el PDF omite las columnas marcadas y alinea las cifras a la derecha", () => {
    expect(columnasPdf(COLUMNAS)).toEqual([
      { titulo: "Medio", alinear: "izquierda" },
      { titulo: "GMV", alinear: "derecha" },
      { titulo: "Cumplimiento", alinear: "derecha" },
      { titulo: "Activo", alinear: "izquierda" },
    ])
    const [fila] = filasPdf(COLUMNAS, [FILA])
    expect(fila).toHaveLength(4)
    expect(fila[0]).toBe("Rionegro Hoy")
    expect(fila[3]).toBe("Sí")
  })

  it("en el PDF la cifra en pesos viaja entera, sin espacio que la parta", () => {
    const [fila] = filasPdf(COLUMNAS, [FILA])
    expect(fila[1]).toBe("$1.250.000")
    expect(cifraSinCorte("$ 12.000")).toBe("$12.000")
    expect(cifraSinCorte("-$ 5.000")).toBe("-$5.000")
    expect(cifraSinCorte("31,4 horas")).toBe("31,4 horas")
  })

  it("una fila vacía se exporta con rayas (PDF) y celdas vacías (Excel)", () => {
    const vacia: Fila = {
      nombre: "",
      gmv: null,
      tasa: null,
      activo: false,
      visto: null,
    }
    expect(filasPdf(COLUMNAS, [vacia])[0]).toEqual(["—", "—", "—", "No"])
    expect(filasExcel(COLUMNAS, [vacia])[0]).toEqual([
      null,
      null,
      null,
      "No",
      null,
    ])
  })
})
