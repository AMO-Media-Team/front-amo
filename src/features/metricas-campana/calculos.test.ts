import { describe, expect, it } from "vitest"

import {
  asignacionPrueba,
  cortePrueba,
  publicacionPrueba,
} from "@/features/seguimiento/fixtures"

import {
  campanaMetricas,
  hayParciales,
  periodoVerificacion,
  resultadosParciales,
  totalesDesdeFilas,
} from "./calculos"
import { filaDesempeno } from "./fixtures"

describe("totalesDesdeFilas", () => {
  it("suma y reconstruye las razones como cociente de sumas", () => {
    const totales = totalesDesdeFilas([
      filaDesempeno("INSTAGRAM", "Instagram", {
        asignaciones: 2,
        gmv: 3_000_000,
        alcance: 40_000,
        impresiones: 60_000,
        interacciones: 1_200,
        clics: 30,
      }),
      filaDesempeno("TIKTOK", "TikTok", {
        asignaciones: 1,
        gmv: 1_500_000,
        alcance: 100_000,
        impresiones: 140_000,
        interacciones: 7_700,
        reproducciones: 140_000,
      }),
    ])
    expect(totales).toMatchObject({
      verificadas: 3,
      inversion: 4_500_000,
      alcance: 140_000,
      impresiones: 200_000,
      interacciones: 8_900,
      reproducciones: 140_000,
      clics: 30,
    })
    // Σ bruto / Σ impresiones × 1.000, no el promedio de los CPM (50.000 y 10.714).
    expect(totales.cpm).toBeCloseTo(22_500, 6)
    expect(totales.costoInteraccion).toBeCloseTo(4_500_000 / 8_900, 6)
    expect(totales.engagement).toBeCloseTo(8_900 / 140_000, 9)
    expect(totales.costoAlcance).toBeCloseTo(4_500_000 / 140_000, 9)
  })

  it("sin denominador la razón queda en null", () => {
    const totales = totalesDesdeFilas([
      filaDesempeno("FACEBOOK", "Facebook", {
        impresiones: 0,
        interacciones: 0,
        alcance: 0,
      }),
    ])
    expect(totales.cpm).toBeNull()
    expect(totales.engagement).toBeNull()
    expect(totalesDesdeFilas([]).verificadas).toBe(0)
  })
})

describe("periodoVerificacion", () => {
  it("va del primer al último día de verificación en Bogotá", () => {
    expect(
      periodoVerificacion([
        // 21 oct, 2:00 a. m. UTC = 20 oct en Bogotá.
        { estado: "VERIFICADA", verificadaAt: "2026-10-21T02:00:00.000Z" },
        { estado: "PAGADA", verificadaAt: "2026-10-18T15:00:00.000Z" },
        { estado: "LIQUIDADA", verificadaAt: "2026-10-25T15:00:00.000Z" },
        // No cumplidas: no cuentan aunque traigan fecha.
        { estado: "EN_DISPUTA", verificadaAt: "2026-09-01T15:00:00.000Z" },
        { estado: "METRICAS_CARGADAS", verificadaAt: null },
      ])
    ).toEqual({ desde: "2026-10-18", hasta: "2026-10-25" })
  })

  it("sin verificadas no hay periodo", () => {
    expect(
      periodoVerificacion([{ estado: "PUBLICADA", verificadaAt: null }])
    ).toBeNull()
  })
})

describe("resultadosParciales", () => {
  it("separa lo que ya tiene cortes de lo que sigue en ejecución", () => {
    const conCortes = asignacionPrueba({
      estado: "EVIDENCIA_VALIDADA",
      publicaciones: [
        publicacionPrueba({
          cortes: [
            cortePrueba({ corte: "H24", alcance: 100 }),
            cortePrueba({
              corte: "H72",
              alcance: 300,
              impresiones: 500,
              interacciones: 20,
            }),
          ],
        }),
      ],
    })
    const parciales = resultadosParciales([
      conCortes,
      asignacionPrueba({ estado: "CONTENIDO_ENTREGADO" }),
      asignacionPrueba({
        estado: "PUBLICADA",
        publicaciones: [publicacionPrueba()],
      }),
      // Cumplidas (ya en el consolidado) y caídas no cuentan.
      asignacionPrueba({
        estado: "VERIFICADA",
        publicaciones: [publicacionPrueba({ cortes: [cortePrueba()] })],
      }),
      asignacionPrueba({ estado: "VENCIDA_SIN_PUBLICAR" }),
    ])
    expect(parciales).toEqual({
      conCortes: 1,
      alcance: 300,
      impresiones: 500,
      interacciones: 20,
      enEjecucion: 2,
    })
    expect(hayParciales(parciales)).toBe(true)
    expect(hayParciales(resultadosParciales([]))).toBe(false)
  })
})

describe("campanaMetricas", () => {
  it("toma de la ficha solo lo que viaja a la pestaña", () => {
    const ficha = {
      id: "c1",
      nombre: "Navidad",
      marca: "Café",
      estado: "ACTIVA" as const,
      fechaInicio: "2026-10-01",
      fechaFin: "2026-10-31",
      presupuestoTotal: 10_000_000,
      objetivo: "Ventas",
    }
    expect(campanaMetricas(ficha)).toEqual({
      id: "c1",
      nombre: "Navidad",
      marca: "Café",
      estado: "ACTIVA",
      fechaInicio: "2026-10-01",
      fechaFin: "2026-10-31",
    })
  })
})
