import { describe, expect, it } from "vitest"

import { altoHojaDetalle, CLASE_ALTO_HOJA_DETALLE } from "./lienzo"

describe("alto de la hoja de detalle", () => {
  it("en un teléfono mide el 60 % de la ventana (explorador + barra superior)", () => {
    // Ventana de 844 px: el explorador mide 844 − 56.
    expect(altoHojaDetalle(788)).toBe(506)
  })

  it("en una tableta no pasa de 34 rem", () => {
    expect(altoHojaDetalle(1040)).toBe(544)
  })

  it("en pantalla completa el explorador ya es toda la ventana", () => {
    expect(altoHojaDetalle(800, true)).toBe(480)
  })

  it("la clase de la hoja declara la misma medida", () => {
    expect(CLASE_ALTO_HOJA_DETALLE).toContain("min(60dvh,34rem)")
  })
})
