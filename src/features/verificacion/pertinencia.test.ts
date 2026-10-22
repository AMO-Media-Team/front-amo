import { describe, expect, it } from "vitest"

import {
  efectoMultiplicador,
  type FilaPertinencia,
  multiplicadorEnRango,
  ordenarPertinencia,
  parsearMultiplicador,
  redondearMultiplicador,
  textoMultiplicador,
} from "./pertinencia"

describe("parsearMultiplicador", () => {
  it("admite coma o punto y hasta tres decimales", () => {
    expect(parsearMultiplicador("1,15")).toBe(1.15)
    expect(parsearMultiplicador("1.150")).toBe(1.15)
    expect(parsearMultiplicador(" 0,9 ")).toBe(0.9)
    expect(parsearMultiplicador("1")).toBe(1)
    expect(parsearMultiplicador("1,250 ×")).toBe(1.25)
  })

  it("rechaza lo demás", () => {
    expect(parsearMultiplicador("")).toBeNull()
    expect(parsearMultiplicador("1,2345")).toBeNull()
    expect(parsearMultiplicador("-1")).toBeNull()
    expect(parsearMultiplicador("uno")).toBeNull()
    expect(parsearMultiplicador("1,1,1")).toBeNull()
  })
})

describe("rango y formato", () => {
  it("0,500 a 1,500 inclusive", () => {
    expect(multiplicadorEnRango(0.5)).toBe(true)
    expect(multiplicadorEnRango(1.5)).toBe(true)
    expect(multiplicadorEnRango(0.499)).toBe(false)
    expect(multiplicadorEnRango(1.501)).toBe(false)
    expect(multiplicadorEnRango(Number.NaN)).toBe(false)
  })

  it("redondea a tres decimales y escribe con coma", () => {
    expect(redondearMultiplicador(1.23456)).toBe(1.235)
    expect(textoMultiplicador(1.15)).toBe("1,150")
  })
})

describe("efectoMultiplicador", () => {
  it("describe el ajuste sobre el precio", () => {
    expect(efectoMultiplicador(1)).toEqual({
      tono: "neutro",
      texto: "Precio sin ajuste",
    })
    expect(efectoMultiplicador(1.15)).toMatchObject({ tono: "exito" })
    expect(efectoMultiplicador(1.15).texto).toMatch(/^Sube el precio 15\s?%$/)
    expect(efectoMultiplicador(0.9).texto).toMatch(/^Baja el precio 10\s?%$/)
    expect(efectoMultiplicador(1.005).texto).toMatch(/0,5\s?%$/)
  })
})

describe("ordenarPertinencia", () => {
  function fila(municipio: string, multiplicador: number): FilaPertinencia {
    return {
      municipioCodigo: municipio,
      municipio,
      departamento: null,
      multiplicador,
      notas: null,
      clasificadoPor: null,
      clasificadoAt: null,
    }
  }

  it("mayor multiplicador primero y luego por nombre", () => {
    const orden = ordenarPertinencia([
      fila("Pasto", 1),
      fila("Ipiales", 1.2),
      fila("Envigado", 1),
    ]).map((f) => f.municipio)
    expect(orden).toEqual(["Ipiales", "Envigado", "Pasto"])
  })
})
