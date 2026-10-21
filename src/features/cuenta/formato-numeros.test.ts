import { describe, expect, it } from "vitest"

import { crearFormateadorNumeros } from "./formato-numeros"

/** Intl usa espacios duros (U+00A0) entre el símbolo y la cifra. */
const sinEspaciosDuros = (texto: string) => texto.replace(/\u00a0/g, " ")

describe("crearFormateadorNumeros", () => {
  it("colombia: punto de miles y coma decimal", () => {
    const f = crearFormateadorNumeros("colombia")
    expect(f.numero(1234567.891, 2)).toBe("1.234.567,89")
    expect(sinEspaciosDuros(f.moneda(1234567))).toBe("$ 1.234.567")
    expect(f.porcentaje(0.125)).toBe("12,5%")
  })

  it("internacional: coma de miles y punto decimal, mismo símbolo", () => {
    const f = crearFormateadorNumeros("internacional")
    expect(f.numero(1234567.891, 2)).toBe("1,234,567.89")
    expect(sinEspaciosDuros(f.moneda(1234567))).toBe("$ 1,234,567")
    expect(f.porcentaje(0.125)).toBe("12.5%")
  })

  it("sin valor muestra una raya", () => {
    const f = crearFormateadorNumeros("colombia")
    expect(f.numero(null)).toBe("—")
    expect(f.moneda(Number.NaN)).toBe("—")
  })
})
