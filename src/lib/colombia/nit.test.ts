import { describe, expect, it } from "vitest"

import {
  digitoSugerido,
  digitoVerificacion,
  formatearNit,
  nitValido,
  normalizarNit,
  separarNit,
} from "./nit"

describe("digitoVerificacion", () => {
  it.each([
    // Los mismos casos que comprueba la migración 20261022024336_e2_desbloqueo.
    ["999000001", "2"],
    ["900123456", "8"],
    ["860002183", "9"],
    // NIT públicos: DIAN, Ecopetrol y Bancolombia.
    ["800197268", "4"],
    ["899999068", "1"],
    ["890903938", "8"],
  ])("%s → %s", (nit, dv) => {
    expect(digitoVerificacion(nit)).toBe(dv)
  })

  it("con residuo 0 o 1 el dígito es el propio residuo", () => {
    expect(digitoVerificacion("900000009")).toBe("0")
    expect(digitoVerificacion("900000002")).toBe("1")
  })

  it("usa los 15 pesos oficiales y admite NIT cortos", () => {
    expect(digitoVerificacion("123456789012345")).toBe("2")
    expect(digitoVerificacion("1")).toBe("8")
  })

  it("rechaza lo que no son entre 1 y 15 dígitos", () => {
    expect(() => digitoVerificacion("")).toThrow(RangeError)
    expect(() => digitoVerificacion("12a")).toThrow(RangeError)
    expect(() => digitoVerificacion("900.123.456")).toThrow(RangeError)
    expect(() => digitoVerificacion("1234567890123456")).toThrow(RangeError)
  })
})

describe("nitValido", () => {
  it("acepta el NIT con su dígito correcto", () => {
    expect(nitValido("900123456", "8")).toBe(true)
    expect(nitValido("999000001", "2")).toBe(true)
  })

  it("rechaza un dígito que no corresponde", () => {
    expect(nitValido("900123456", "7")).toBe(false)
  })

  it("exige de 6 a 15 dígitos sin separadores y un DV de un dígito", () => {
    expect(nitValido("12345", digitoVerificacion("12345"))).toBe(false)
    expect(nitValido("900.123.456", "8")).toBe(false)
    expect(nitValido("900123456", "")).toBe(false)
    expect(nitValido("900123456", "88")).toBe(false)
    expect(nitValido("1234567890123456", "0")).toBe(false)
  })
})

describe("separarNit y normalizarNit", () => {
  it("quita puntos, comas y espacios", () => {
    expect(separarNit("900.123.456")).toEqual({ nit: "900123456", dv: null })
    expect(separarNit(" 900 123 456 ")).toEqual({ nit: "900123456", dv: null })
    expect(separarNit("900,123,456")).toEqual({ nit: "900123456", dv: null })
  })

  it("reconoce el DV tras el guion, con o sin espacios", () => {
    expect(separarNit("900.123.456-8")).toEqual({ nit: "900123456", dv: "8" })
    expect(separarNit("900123456 - 8")).toEqual({ nit: "900123456", dv: "8" })
  })

  it("un guion sin dígito se descarta", () => {
    expect(separarNit("900123456-")).toEqual({ nit: "900123456", dv: null })
  })

  it("conserva otros caracteres para que la validación los señale", () => {
    expect(normalizarNit("90A.123")).toBe("90A123")
    // Un guion que no precede a un único dígito final no es el del DV.
    expect(normalizarNit("900-12-345")).toBe("900-12-345")
  })

  it("normalizarNit devuelve solo el NIT", () => {
    expect(normalizarNit("900.123.456-8")).toBe("900123456")
    expect(normalizarNit("")).toBe("")
  })

  it("tolera espacios al final y antes del guion", () => {
    expect(separarNit("900123456 -8  ")).toEqual({ nit: "900123456", dv: "8" })
    expect(separarNit("900123456 - ")).toEqual({ nit: "900123456", dv: null })
  })

  it("procesa en tiempo lineal un texto enorme (llega sin filtrar a la acción)", () => {
    // Con el patrón anterior (`\s*-\s*…$`) esto tardaba decenas de segundos.
    const espacios = " ".repeat(400_000)
    const inicio = performance.now()
    expect(separarNit(`${espacios}x`).dv).toBeNull()
    expect(separarNit(`9${espacios}-${espacios}x`).dv).toBeNull()
    expect(performance.now() - inicio).toBeLessThan(1_000)
  })
})

describe("digitoSugerido", () => {
  it("calcula el DV en cuanto el NIT está completo", () => {
    expect(digitoSugerido("900.123.456")).toBe("8")
    expect(digitoSugerido("900123456-3")).toBe("8")
  })

  it("no sugiere nada con un NIT incompleto o inválido", () => {
    expect(digitoSugerido("")).toBeNull()
    expect(digitoSugerido("12345")).toBeNull()
    expect(digitoSugerido("90012345a")).toBeNull()
    expect(digitoSugerido("1234567890123456")).toBeNull()
  })
})

describe("formatearNit", () => {
  it("agrupa miles con punto y añade el DV", () => {
    expect(formatearNit("900123456", "8")).toBe("900.123.456-8")
    expect(formatearNit("123456789012345", "2")).toBe("123.456.789.012.345-2")
  })

  it("sin DV muestra solo el NIT", () => {
    expect(formatearNit("900123456")).toBe("900.123.456")
    expect(formatearNit("900123456", null)).toBe("900.123.456")
  })

  it("un valor que no son dígitos se muestra tal cual", () => {
    expect(formatearNit("EIN-12-3456789")).toBe("EIN-12-3456789")
  })
})
