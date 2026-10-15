import { describe, expect, it } from "vitest"

import { aTituloEspanol, parsearDecimalConComa, redondear } from "./texto"

describe("aTituloEspanol", () => {
  it.each([
    ["MEDELLÍN", "Medellín"],
    ["SAN JOSÉ DE CÚCUTA", "San José de Cúcuta"],
    ["EL CARMEN DE VIBORAL", "El Carmen de Viboral"],
    ["LA JAGUA DEL PILAR", "La Jagua del Pilar"],
    ["BOGOTÁ, D.C.", "Bogotá, D.C."],
    ["PIENDAMÓ - TUNÍA", "Piendamó - Tunía"],
    ["MIRITÍ-PARANÁ", "Mirití-Paraná"],
    [
      "ARCHIPIÉLAGO DE SAN ANDRÉS, PROVIDENCIA Y SANTA CATALINA",
      "Archipiélago de San Andrés, Providencia y Santa Catalina",
    ],
    ["LOS PATIOS", "Los Patios"],
    ["SAN PEDRO DE LOS MILAGROS", "San Pedro de los Milagros"],
    ["MARÍA LA BAJA", "María La Baja"],
    ["CASTILLA LA NUEVA", "Castilla La Nueva"],
  ])("%s → %s", (entrada, esperado) => {
    expect(aTituloEspanol(entrada)).toBe(esperado)
  })
})

describe("parsearDecimalConComa", () => {
  it("convierte la coma decimal de datos.gov.co", () => {
    expect(parsearDecimalConComa("-75,581775")).toBe(-75.581775)
    expect(parsearDecimalConComa("6.2")).toBe(6.2)
  })

  it("rechaza texto que no es número", () => {
    expect(() => parsearDecimalConComa("n/d")).toThrow()
  })
})

describe("redondear", () => {
  it("redondea a los decimales pedidos", () => {
    expect(redondear(-75.581775, 4)).toBe(-75.5818)
    expect(redondear(12.34, 0)).toBe(12)
  })
})
