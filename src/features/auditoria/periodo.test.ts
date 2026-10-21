import { describe, expect, it } from "vitest"

import { rangoPersonalizado, parsearFecha, serializarRango } from "@/lib/fechas"

import {
  esquemaPeriodo,
  etiquetaComparacion,
  etiquetaRango,
  presetDeValores,
  rangoDeValores,
  ventanasComparadas,
} from "./periodo"

// 15:00 del 30-sep en Bogotá.
const AHORA = new Date("2026-09-30T20:00:00Z")

describe("presetDeValores", () => {
  it("explícito, personalizado por fechas o el de por defecto", () => {
    expect(
      presetDeValores({ periodo: "ultimos7", desde: null, hasta: null })
    ).toBe("ultimos7")
    expect(
      presetDeValores({
        periodo: null,
        desde: "2026-09-01",
        hasta: "2026-09-15",
      })
    ).toBe("personalizado")
    expect(
      presetDeValores({ periodo: null, desde: "2026-09-01", hasta: null })
    ).toBe("ultimos30")
  })
})

describe("rangoDeValores", () => {
  it("un enlace con solo desde/hasta (insights, mapa) es un rango personalizado", () => {
    const rango = rangoDeValores(
      { periodo: null, desde: "2026-09-01", hasta: "2026-09-15" },
      AHORA
    )
    expect(serializarRango(rango)).toEqual({
      preset: "personalizado",
      desde: "2026-09-01",
      hasta: "2026-09-15",
    })
  })

  it("un preset explícito ignora las fechas sueltas", () => {
    const rango = rangoDeValores(
      { periodo: "hoy", desde: "2026-01-01", hasta: "2026-01-02" },
      AHORA
    )
    expect(serializarRango(rango)).toEqual({
      preset: "hoy",
      desde: "2026-09-30",
      hasta: "2026-09-30",
    })
  })

  it("sin nada: últimos 30 días", () => {
    const rango = rangoDeValores(
      { periodo: null, desde: null, hasta: null },
      AHORA
    )
    expect(serializarRango(rango)).toEqual({
      preset: "ultimos30",
      desde: "2026-09-01",
      hasta: "2026-09-30",
    })
  })
})

describe("etiquetas", () => {
  it("rango personalizado en español, abreviado dentro del mismo año", () => {
    const texto = (desde: string, hasta: string) =>
      etiquetaRango(
        rangoPersonalizado(parsearFecha(desde)!, parsearFecha(hasta)!)
      ).replace(/\s/g, " ")
    expect(texto("2026-09-01", "2026-09-15")).toBe(
      "1 de sept – 15 de sept de 2026"
    )
    expect(texto("2025-12-20", "2026-01-10")).toBe(
      "20 de dic de 2025 – 10 de ene de 2026"
    )
    expect(texto("2026-09-15", "2026-09-15")).toBe("15 de sept de 2026")
  })

  it("comparación según el preset", () => {
    const hoy = rangoDeValores(
      { periodo: "hoy", desde: null, hasta: null },
      AHORA
    )
    expect(etiquetaComparacion(hoy)).toBe("frente a ayer")
    const mes = rangoDeValores(
      { periodo: "esteMes", desde: null, hasta: null },
      AHORA
    )
    expect(etiquetaComparacion(mes)).toBe("frente al mes anterior")
    const siete = rangoDeValores(
      { periodo: "ultimos7", desde: null, hasta: null },
      AHORA
    )
    expect(etiquetaComparacion(siete)).toBe("frente al periodo anterior")
  })
})

describe("ventanasComparadas", () => {
  it("instantes UTC de medianoche de Bogotá, actual y anterior del mismo largo", () => {
    const rango = rangoDeValores(
      { periodo: "ultimos7", desde: null, hasta: null },
      AHORA
    )
    expect(ventanasComparadas(rango)).toEqual({
      actual: {
        desde: "2026-09-24T05:00:00.000Z",
        hastaExclusivo: "2026-10-01T05:00:00.000Z",
      },
      anterior: {
        desde: "2026-09-17T05:00:00.000Z",
        hastaExclusivo: "2026-09-24T05:00:00.000Z",
      },
    })
  })
})

describe("esquemaPeriodo", () => {
  it("acepta el periodo nulo (por defecto) y rechaza presets inventados", () => {
    expect(
      esquemaPeriodo.safeParse({ periodo: null, desde: null, hasta: null })
        .success
    ).toBe(true)
    expect(
      esquemaPeriodo.safeParse({ periodo: "siempre", desde: null, hasta: null })
        .success
    ).toBe(false)
  })
})
