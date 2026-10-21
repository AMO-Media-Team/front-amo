import { describe, expect, it } from "vitest"

import {
  conUnidad,
  formatearEje,
  formatearEtiqueta,
  formatearValor,
} from "./formatos"
import { trazarSparkline } from "./trazado-sparkline"

const plano = (texto: string) => texto.replace(/[\u00a0\u202f]/g, " ")

describe("formatearValor", () => {
  it.each([
    ["cop", 1_234_567, "$ 1.234.567"],
    ["copCompacto", 12_500_000, "$12,5 M"],
    ["numero", 12345, "12.345"],
    ["compacto", 1_250_000, "1,3 M"],
    ["porcentaje", 0.125, "12,5%"],
    ["decimal", 3.14159, "3,14"],
  ] as const)("%s", (formato, valor, esperado) => {
    expect(plano(formatearValor(valor, formato))).toBe(esperado)
  })

  it("sin valor muestra una raya", () => {
    expect(formatearValor(null, "cop")).toBe("—")
    expect(formatearValor(undefined, "numero")).toBe("—")
  })
})

describe("formatearEje", () => {
  it("usa marcas compactas y redondeadas", () => {
    expect(plano(formatearEje(12_000_000, "cop"))).toBe("$12 M")
    expect(formatearEje(9_999, "numero")).toBe("9.999")
    expect(plano(formatearEje(25_000, "numero"))).toBe("25 mil")
    expect(formatearEje(0.4, "porcentaje")).toBe("40%")
  })
})

describe("formatearEtiqueta", () => {
  it("abrevia el dinero y deja el resto completo", () => {
    expect(plano(formatearEtiqueta(1_500_000, "cop"))).toBe("$1,5 M")
    expect(formatearEtiqueta(1500, "numero")).toBe("1.500")
  })
})

describe("conUnidad", () => {
  it("concuerda en número", () => {
    const unidad = { singular: "medio", plural: "medios" }
    expect(conUnidad(1, unidad)).toBe("1 medio")
    expect(conUnidad(0, unidad)).toBe("0 medios")
    expect(conUnidad(1200, unidad)).toBe("1.200 medios")
  })
})

describe("trazarSparkline", () => {
  it("sin puntos no dibuja nada", () => {
    expect(trazarSparkline([], 100, 30)).toEqual({
      linea: "",
      area: "",
      ultimo: null,
    })
    expect(trazarSparkline([null, null], 100, 30).linea).toBe("")
    expect(trazarSparkline([1, 2], 0, 30).linea).toBe("")
  })

  it("una serie plana queda a media altura", () => {
    const { linea, ultimo } = trazarSparkline([5, 5, 5], 100, 30)
    expect(linea).toBe("M3 15 L50 15 L97 15")
    expect(ultimo).toEqual({ x: 97, y: 15 })
  })

  it("el máximo toca el margen superior y el mínimo el inferior", () => {
    const { linea } = trazarSparkline([0, 10], 100, 30)
    expect(linea).toBe("M3 27 L97 3")
  })

  it("los huecos cortan la línea en tramos (no inventa valores)", () => {
    const { linea, area } = trazarSparkline([1, 2, null, 3, 4], 100, 30)
    expect(linea.match(/M/g)).toHaveLength(2)
    expect(area.match(/Z/g)).toHaveLength(2)
  })

  it("un único punto se centra", () => {
    expect(trazarSparkline([7], 100, 30).ultimo).toEqual({ x: 50, y: 15 })
  })
})
