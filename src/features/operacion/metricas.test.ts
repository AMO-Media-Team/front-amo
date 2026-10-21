import { describe, expect, it } from "vitest"

import {
  type CorteMetrica,
  describirAlertas,
  engagement,
  leerDetalleAlertas,
  nombresColumnas,
  ordenarCortes,
  tieneAlerta,
} from "./metricas"

const SIN_DETALLE = leerDetalleAlertas(null)

describe("nombresColumnas", () => {
  it("TikTok habla de espectadores y reproducciones", () => {
    expect(nombresColumnas("TIKTOK")).toEqual({
      alcance: "Espectadores únicos",
      impresiones: "Reproducciones",
    })
    expect(nombresColumnas("INSTAGRAM").alcance).toBe("Alcance")
  })
})

describe("engagement", () => {
  it("interacciones sobre alcance; sin alcance no hay tasa", () => {
    expect(engagement(50, 1_000)).toBe(0.05)
    expect(engagement(50, 0)).toBeNull()
    expect(engagement(null, 1_000)).toBeNull()
  })
})

describe("ordenarCortes", () => {
  it("24 h → 72 h → 7 días → personalizado, y por fecha dentro del mismo", () => {
    const ordenados = ordenarCortes([
      { corte: "D7" as const, fechaCorte: "2026-09-08" },
      { corte: "PERSONALIZADO" as const, fechaCorte: "2026-09-03" },
      { corte: "H24" as const, fechaCorte: "2026-09-02" },
      { corte: "PERSONALIZADO" as const, fechaCorte: "2026-09-01" },
    ])
    expect(ordenados.map((c) => `${c.corte}@${c.fechaCorte}`)).toEqual([
      "H24@2026-09-02",
      "D7@2026-09-08",
      "PERSONALIZADO@2026-09-01",
      "PERSONALIZADO@2026-09-03",
    ])
  })
})

describe("alertas de integridad", () => {
  it("lee el jsonb tolerando faltantes y textos numéricos", () => {
    expect(
      leerDetalleAlertas({
        mediana_historica: "1200",
        n_historial: 8,
        factor: 3,
        otro: true,
      })
    ).toEqual({
      medianaHistorica: 1_200,
      nHistorial: 8,
      factor: 3,
      seguidores: null,
      multiplo: null,
    })
    expect(leerDetalleAlertas([1, 2])).toEqual(SIN_DETALLE)
  })

  it("explica cada alerta con sus referencias", () => {
    const corte: Pick<
      CorteMetrica,
      "alertaDesviacion" | "alertaMultiplo" | "detalleAlertas" | "alcance"
    > = {
      alertaDesviacion: true,
      alertaMultiplo: true,
      alcance: 90_000,
      detalleAlertas: {
        medianaHistorica: 12_000,
        nHistorial: 6,
        factor: 3,
        seguidores: 40_000,
        multiplo: 1.5,
      },
    }
    const [multiplo, desviacion] = describirAlertas(corte)
    expect(multiplo).toMatch(/supera lo esperable.*1,5 × 40\.000 seguidores/)
    expect(desviacion).toMatch(/histórico.*12\.000.*3 ×/)
    expect(tieneAlerta(corte)).toBe(true)
  })

  it("sin alertas no hay motivos", () => {
    const corte = {
      alertaDesviacion: false,
      alertaMultiplo: false,
      alcance: 10,
      detalleAlertas: SIN_DETALLE,
    }
    expect(describirAlertas(corte)).toEqual([])
    expect(tieneAlerta(corte)).toBe(false)
  })
})
