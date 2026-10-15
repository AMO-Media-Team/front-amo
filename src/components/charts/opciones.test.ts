import { describe, expect, it } from "vitest"

import { maximoConMargen, rangoConHolgura, retardoEscalonado } from "./opciones"

describe("rangoConHolgura", () => {
  it("abarca al menos ±10 % del valor medio (no exagera variaciones mínimas)", () => {
    const { suggestedMin, suggestedMax } = rangoConHolgura([0.196, 0.2, 0.201])
    expect(suggestedMin).toBeCloseTo(0.179, 3)
    expect(suggestedMax).toBeCloseTo(0.218, 3)
  })

  it("con mucha variación usa el rango real", () => {
    expect(rangoConHolgura([10, 50])).toEqual({
      suggestedMin: 10,
      suggestedMax: 50,
    })
  })

  it("no baja de cero con valores positivos, sí con negativos", () => {
    expect(rangoConHolgura([0, 0.001]).suggestedMin).toBe(0)
    expect(rangoConHolgura([-5, -4.9]).suggestedMin).toBeLessThan(-5)
  })

  it("ignora huecos y sin datos no sugiere nada", () => {
    expect(rangoConHolgura([null, 100, null]).suggestedMax).toBeCloseTo(110)
    expect(rangoConHolgura([null])).toEqual({})
  })
})

describe("retardoEscalonado", () => {
  it("escalona solo la animación inicial de datos", () => {
    const retardo = retardoEscalonado(20)
    expect(retardo({ type: "data", mode: "default", dataIndex: 3 })).toBe(60)
    expect(retardo({ type: "data", mode: "resize", dataIndex: 3 })).toBe(0)
    expect(retardo({ type: "dataset", mode: "default", dataIndex: 3 })).toBe(0)
  })
})

describe("maximoConMargen", () => {
  it("deja aire sobre el valor más alto", () => {
    expect(maximoConMargen([100, 250, null, 180])).toBeCloseTo(280)
    expect(maximoConMargen([100], 0.5)).toBe(150)
  })

  it("sin valores positivos deja que Chart.js decida", () => {
    expect(maximoConMargen([])).toBeUndefined()
    expect(maximoConMargen([null, 0])).toBeUndefined()
  })
})
