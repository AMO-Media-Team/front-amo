import { describe, expect, it } from "vitest"

import { enFrase, franjaPara } from "./franjas"
import type { FranjaSeguidores } from "./tipos"

describe("franjaPara", () => {
  // Desordenadas a propósito: la función no depende del orden de la consulta.
  const FRANJAS: FranjaSeguidores[] = [
    {
      id: "f3",
      clave: "F3",
      nombre: "Más de 120.000",
      seguidoresMin: 120_001,
      seguidoresMax: null,
    },
    {
      id: "f1",
      clave: "F1",
      nombre: "30.000 – 60.000",
      seguidoresMin: 30_000,
      seguidoresMax: 60_000,
    },
    {
      id: "f2",
      clave: "F2",
      nombre: "60.001 – 120.000",
      seguidoresMin: 60_001,
      seguidoresMax: 120_000,
    },
  ]

  it("ubica los seguidores en su franja, incluidos los bordes", () => {
    expect(franjaPara(30_000, FRANJAS)?.clave).toBe("F1")
    expect(franjaPara(60_000, FRANJAS)?.clave).toBe("F1")
    expect(franjaPara(60_001, FRANJAS)?.clave).toBe("F2")
    expect(franjaPara(2_000_000, FRANJAS)?.clave).toBe("F3")
  })

  it("por debajo del umbral, o sin un número, no hay franja", () => {
    expect(franjaPara(29_999, FRANJAS)).toBeNull()
    expect(franjaPara(Number.NaN, FRANJAS)).toBeNull()
    expect(franjaPara(Number.POSITIVE_INFINITY, FRANJAS)).toBeNull()
  })

  it("sin franjas configuradas no hay franja", () => {
    expect(franjaPara(50_000, [])).toBeNull()
  })
})

describe("enFrase", () => {
  it("pone en minúscula solo la inicial", () => {
    expect(enFrase("Más de 120.000")).toBe("más de 120.000")
    expect(enFrase("Cédula (frente)")).toBe("cédula (frente)")
    expect(enFrase("Integración (API)")).toBe("integración (API)")
    expect(enFrase("Cámara de comercio")).toBe("cámara de comercio")
  })

  it("conserva las siglas y lo que empieza por cifras", () => {
    expect(enFrase("RUT")).toBe("RUT")
    expect(enFrase("RUT de la sociedad")).toBe("RUT de la sociedad")
    expect(enFrase("30.000 – 60.000")).toBe("30.000 – 60.000")
  })
})
