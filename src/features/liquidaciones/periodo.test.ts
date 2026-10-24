import { describe, expect, it } from "vitest"

import {
  diaDeInstante,
  erroresDePeriodo,
  erroresPeriodoDeAccion,
  esPeriodicidad,
  hoyBogota,
  mediosDelCorte,
} from "./periodo"
import type { MedioCorte } from "./tipos"

describe("días de Bogotá", () => {
  it("hoy y el día de un instante se cuentan en Bogotá, no en UTC", () => {
    // 03:00 UTC del 16 = 22:00 del 15 en Bogotá.
    expect(hoyBogota(new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-15")
    expect(diaDeInstante("2026-10-16T03:00:00Z")).toBe("2026-10-15")
    expect(diaDeInstante("2026-10-16T05:00:00Z")).toBe("2026-10-16")
  })
})

describe("esPeriodicidad", () => {
  it("solo las de la configuración", () => {
    expect(esPeriodicidad("QUINCENAL")).toBe(true)
    expect(esPeriodicidad("ANUAL")).toBe(false)
    expect(esPeriodicidad(null)).toBe(false)
  })
})

describe("mediosDelCorte", () => {
  const medio = (
    numero: number,
    primeraVerificada: string,
    ultimaLiquidacionFin: string | null = null
  ): MedioCorte => ({
    medioId: `m${numero}`,
    primeraVerificada,
    ultimaLiquidacionFin,
  })

  it("entran los que tienen alguna verificada hasta el último día (de Bogotá)", () => {
    const medios = [
      medio(1, "2026-10-02T15:00:00Z"),
      // 22:00 del 15 en Bogotá: entra en el corte que termina el 15.
      medio(2, "2026-10-16T03:00:00Z"),
      medio(3, "2026-10-16T15:00:00Z"),
    ]
    expect(
      mediosDelCorte(medios, { inicio: "2026-10-01", fin: "2026-10-15" })
    ).toEqual({ entran: 2, conCruce: 0 })
  })

  it("cuenta los que ya tienen una liquidación que se cruza con el periodo", () => {
    const medios = [
      medio(1, "2026-09-20T15:00:00Z", "2026-10-15"),
      medio(2, "2026-09-20T15:00:00Z", "2026-09-30"),
      medio(3, "2026-10-20T15:00:00Z", "2026-10-15"),
    ]
    expect(
      mediosDelCorte(medios, { inicio: "2026-10-01", fin: "2026-10-15" })
    ).toEqual({ entran: 2, conCruce: 1 })
  })
})

describe("errores del periodo", () => {
  it("toma el primer error de cada campo de un safeParse", () => {
    expect(
      erroresDePeriodo([
        { path: ["fin"], message: "A" },
        { path: ["fin"], message: "B" },
        { path: ["inicio"], message: "C" },
        { path: ["medioId"], message: "D" },
      ])
    ).toEqual({ fin: "A", inicio: "C" })
  })

  it("y de los errores de campo de la acción", () => {
    expect(erroresPeriodoDeAccion({ fin: ["Abierto"], otro: ["x"] })).toEqual({
      fin: "Abierto",
    })
    expect(erroresPeriodoDeAccion(undefined)).toEqual({})
  })
})
