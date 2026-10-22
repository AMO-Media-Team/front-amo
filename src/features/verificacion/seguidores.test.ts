import { describe, expect, it } from "vitest"

import {
  parsearSeguidores,
  UMBRAL_SALTO_SEGUIDORES,
  variacionSeguidores,
} from "./seguidores"

describe("variacionSeguidores", () => {
  it("sin verificación anterior no hay variación", () => {
    expect(variacionSeguidores(50_000, null)).toEqual({
      fraccion: null,
      diferencia: null,
      salto: false,
    })
    expect(variacionSeguidores(50_000, 0).fraccion).toBeNull()
  })

  it("calcula el cambio relativo y marca los saltos", () => {
    const leve = variacionSeguidores(52_000, 50_000)
    expect(leve.fraccion).toBeCloseTo(0.04)
    expect(leve.diferencia).toBe(2_000)
    expect(leve.salto).toBe(false)

    const salto = variacionSeguidores(75_000, 50_000)
    expect(salto.fraccion).toBeCloseTo(0.5)
    expect(salto.salto).toBe(true)

    const caida = variacionSeguidores(30_000, 50_000)
    expect(caida.fraccion).toBeCloseTo(-0.4)
    expect(caida.salto).toBe(true)
  })

  it("el umbral marca justo desde su valor", () => {
    const base = 100_000
    expect(
      variacionSeguidores(base * (1 + UMBRAL_SALTO_SEGUIDORES), base).salto
    ).toBe(true)
    expect(variacionSeguidores(base * 1.19, base).salto).toBe(false)
  })
})

describe("parsearSeguidores", () => {
  it("admite separadores de miles", () => {
    expect(parsearSeguidores("58.000")).toBe(58_000)
    expect(parsearSeguidores(" 58 000 ")).toBe(58_000)
    expect(parsearSeguidores("1,234,567")).toBe(1_234_567)
  })

  it("rechaza lo que no es un entero", () => {
    expect(parsearSeguidores("")).toBeNull()
    expect(parsearSeguidores("-5")).toBeNull()
    expect(parsearSeguidores("diez")).toBeNull()
    expect(parsearSeguidores("12345678901")).toBeNull()
  })
})
