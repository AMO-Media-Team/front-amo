import { describe, expect, it } from "vitest"

import { formatearDuracion, formatearTamano, MIB } from "./formato"

const ESPACIO = " "

describe("formatearTamano", () => {
  it("usa bytes, KB, MB y GB con coma decimal", () => {
    expect(formatearTamano(512)).toBe(`512${ESPACIO}bytes`)
    expect(formatearTamano(850 * 1024)).toBe(`850${ESPACIO}KB`)
    expect(formatearTamano(10 * MIB)).toBe(`10${ESPACIO}MB`)
    expect(formatearTamano(12.44 * MIB)).toBe(`12,4${ESPACIO}MB`)
    expect(formatearTamano(3 * 1024 * MIB)).toBe(`3${ESPACIO}GB`)
  })

  it("redondea hacia arriba si se pide (un archivo apenas mayor que el límite)", () => {
    expect(formatearTamano(10 * MIB + 1)).toBe(`10${ESPACIO}MB`)
    expect(formatearTamano(10 * MIB + 1, "arriba")).toBe(`10,1${ESPACIO}MB`)
  })

  it("no inventa cifras con valores inválidos", () => {
    expect(formatearTamano(Number.NaN)).toBe("—")
    expect(formatearTamano(-1)).toBe("—")
  })
})

describe("formatearDuracion", () => {
  it("expresa segundos, minutos y horas", () => {
    expect(formatearDuracion(45)).toBe(`45${ESPACIO}s`)
    expect(formatearDuracion(92)).toBe(`1${ESPACIO}min 32${ESPACIO}s`)
    expect(formatearDuracion(120)).toBe(`2${ESPACIO}min`)
    expect(formatearDuracion(3725)).toBe(`1${ESPACIO}h 2${ESPACIO}min`)
    expect(formatearDuracion(59.6)).toBe(`1${ESPACIO}min`)
  })

  it("no inventa cifras con valores inválidos", () => {
    expect(formatearDuracion(Number.POSITIVE_INFINITY)).toBe("—")
  })
})
