import { describe, expect, it } from "vitest"

import {
  ETIQUETA_SIN_PERIODO,
  etiquetaPeriodo,
  hayPeriodo,
  rangoOpcional,
  ventanaOpcional,
} from "./periodo"

// 15:00 del 30-sep-2026 en Bogotá.
const AHORA = new Date("2026-09-30T20:00:00Z")

describe("periodo opcional", () => {
  it("sin parámetros abarca todo el historial", () => {
    const valores = { periodo: null, desde: null, hasta: null }
    expect(hayPeriodo(valores)).toBe(false)
    expect(rangoOpcional(valores, AHORA)).toBeNull()
    expect(etiquetaPeriodo(null)).toBe(ETIQUETA_SIN_PERIODO)
    expect(ventanaOpcional(null)).toBeNull()
  })

  it("un preset filtra; un rango personalizado exige ambas fechas", () => {
    expect(hayPeriodo({ periodo: "ultimos7", desde: null, hasta: null })).toBe(
      true
    )
    expect(
      hayPeriodo({ periodo: "personalizado", desde: "2026-09-01", hasta: null })
    ).toBe(false)
    expect(
      hayPeriodo({ periodo: null, desde: "2026-09-01", hasta: "2026-09-10" })
    ).toBe(true)
  })

  it("convierte el rango a instantes UTC de Bogotá", () => {
    const rango = rangoOpcional(
      { periodo: null, desde: "2026-09-01", hasta: "2026-09-10" },
      AHORA
    )
    expect(ventanaOpcional(rango)).toEqual({
      desde: "2026-09-01T05:00:00.000Z",
      hastaExclusivo: "2026-09-11T05:00:00.000Z",
    })
    expect(etiquetaPeriodo(rango)).toMatch(/1 .*sept.* – 10 .*sept.* 2026/)
  })
})
