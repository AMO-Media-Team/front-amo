import { describe, expect, it } from "vitest"

import { moverConTecla } from "./lienzo-grafico"

describe("moverConTecla", () => {
  it("la primera flecha activa la primera posición", () => {
    expect(moverConTecla("ArrowRight", null, 5)).toBe(0)
    expect(moverConTecla("ArrowDown", null, 168, 24)).toBe(0)
  })

  it("en una serie, las cuatro flechas avanzan de a una y se detienen en los extremos", () => {
    expect(moverConTecla("ArrowDown", 2, 5)).toBe(3)
    expect(moverConTecla("ArrowUp", 2, 5)).toBe(1)
    expect(moverConTecla("ArrowRight", 4, 5)).toBe(4)
    expect(moverConTecla("ArrowDown", 4, 5)).toBe(4)
    expect(moverConTecla("ArrowLeft", 0, 5)).toBe(0)
    expect(moverConTecla("Home", 3, 5)).toBe(0)
    expect(moverConTecla("End", 0, 5)).toBe(4)
  })

  it("en una rejilla, arriba y abajo saltan una fila completa", () => {
    // Martes 10 h (fila 1, columna 10) → miércoles 10 h y lunes 10 h.
    expect(moverConTecla("ArrowDown", 34, 168, 24)).toBe(58)
    expect(moverConTecla("ArrowUp", 34, 168, 24)).toBe(10)
    expect(moverConTecla("ArrowRight", 34, 168, 24)).toBe(35)
    // En la primera o la última fila no cambia de columna.
    expect(moverConTecla("ArrowDown", 160, 168, 24)).toBe(160)
    expect(moverConTecla("ArrowUp", 5, 168, 24)).toBe(5)
  })

  it("ignora teclas que no navegan y gráficos sin posiciones", () => {
    expect(moverConTecla("Enter", 1, 5)).toBeNull()
    expect(moverConTecla("ArrowRight", null, 0)).toBeNull()
  })
})
