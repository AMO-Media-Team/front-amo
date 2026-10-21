import { describe, expect, it } from "vitest"

import {
  nombrePlataforma,
  pluralizar,
  rangoSeguidores,
  repartoComision,
} from "./presentacion"

describe("presentación", () => {
  it("describe el rango de seguidores de una franja", () => {
    expect(rangoSeguidores(30_000, 60_000)).toBe("30.000 – 60.000 seguidores")
    expect(rangoSeguidores(120_001, null)).toBe("Desde 120.001 seguidores")
  })

  it("reparte el bruto entre AMO y el medio sin perder pesos", () => {
    expect(repartoComision(1_000_000, 0.2)).toEqual({
      bruto: 1_000_000,
      comision: 200_000,
      medio: 800_000,
    })
    const impar = repartoComision(333_333, 0.155)
    expect(impar.comision + impar.medio).toBe(333_333)
    expect(Number.isInteger(impar.comision)).toBe(true)
  })

  it("pluraliza con la cifra formateada", () => {
    expect(pluralizar(1, "plantilla", "plantillas")).toBe("1 plantilla")
    expect(pluralizar(0, "plantilla", "plantillas")).toBe("0 plantillas")
    expect(pluralizar(1250, "municipio", "municipios")).toBe("1.250 municipios")
  })

  it("nombra las plataformas", () => {
    expect(nombrePlataforma("TIKTOK")).toBe("TikTok")
  })
})
