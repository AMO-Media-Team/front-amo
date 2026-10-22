import { describe, expect, it } from "vitest"

import {
  ATAJOS_VIGENCIA,
  esDiaValido,
  sumarMeses,
  vigenciaAdmisible,
} from "./vigencia"

describe("esDiaValido", () => {
  it("solo días reales con formato YYYY-MM-DD", () => {
    expect(esDiaValido("2026-10-22")).toBe(true)
    expect(esDiaValido("2028-02-29")).toBe(true)
    expect(esDiaValido("2027-02-29")).toBe(false)
    expect(esDiaValido("2026-13-01")).toBe(false)
    expect(esDiaValido("22/10/2026")).toBe(false)
    expect(esDiaValido("")).toBe(false)
  })
})

describe("sumarMeses", () => {
  it("suma meses de calendario", () => {
    expect(sumarMeses("2026-10-22", 3)).toBe("2027-01-22")
    expect(sumarMeses("2026-10-22", 12)).toBe("2027-10-22")
    expect(sumarMeses("2026-10-22", 60)).toBe("2031-10-22")
  })

  it("ajusta al último día del mes destino", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28")
    expect(sumarMeses("2027-12-31", 2)).toBe("2028-02-29")
    expect(sumarMeses("2026-08-31", 6)).toBe("2027-02-28")
  })

  it("rechaza un día inválido", () => {
    expect(() => sumarMeses("2026-02-30", 1)).toThrow(RangeError)
  })

  it("los atajos van en orden creciente", () => {
    const meses = ATAJOS_VIGENCIA.map((atajo) => atajo.meses)
    expect([...meses].sort((a, b) => a - b)).toEqual(meses)
  })
})

describe("vigenciaAdmisible", () => {
  it("desde hoy en adelante", () => {
    expect(vigenciaAdmisible("2026-10-22", "2026-10-22")).toBe(true)
    expect(vigenciaAdmisible("2027-01-01", "2026-10-22")).toBe(true)
    expect(vigenciaAdmisible("2026-10-21", "2026-10-22")).toBe(false)
    expect(vigenciaAdmisible("no", "2026-10-22")).toBe(false)
  })
})
