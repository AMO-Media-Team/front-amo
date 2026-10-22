import { describe, expect, it } from "vitest"

import {
  franjaPara,
  parsearSeguidores,
  type RangoFranja,
  UMBRAL_SALTO_SEGUIDORES,
  variacionSeguidores,
} from "./seguidores"

const FRANJAS: RangoFranja[] = [
  { clave: "F1", nombre: "30.000 – 60.000", minimo: 30_000, maximo: 60_000 },
  { clave: "F2", nombre: "60.001 – 120.000", minimo: 60_001, maximo: 120_000 },
  { clave: "F3", nombre: "Más de 120.000", minimo: 120_001, maximo: null },
]

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

describe("franjaPara", () => {
  it("ubica la franja con límites inclusivos", () => {
    expect(franjaPara(30_000, FRANJAS)?.clave).toBe("F1")
    expect(franjaPara(60_000, FRANJAS)?.clave).toBe("F1")
    expect(franjaPara(60_001, FRANJAS)?.clave).toBe("F2")
    expect(franjaPara(5_000_000, FRANJAS)?.clave).toBe("F3")
  })

  it("por debajo del umbral no hay franja", () => {
    expect(franjaPara(25_000, FRANJAS)).toBeNull()
    expect(franjaPara(Number.NaN, FRANJAS)).toBeNull()
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
