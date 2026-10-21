import { describe, expect, it } from "vitest"

import {
  type AsignacionParaIndicadores,
  avisoVencimiento,
  diasHasta,
  indicadoresAsignaciones,
  proporcion,
  resumirCartera,
  resumirCupos,
  serieConDatos,
  serieMensual,
  situacionTope,
  vigenciaVerificacion,
} from "./calculos"

// 15:00 del 30-sep-2026 en Bogotá.
const AHORA = new Date("2026-09-30T20:00:00Z")

function asignacion(
  parcial: Partial<AsignacionParaIndicadores>
): AsignacionParaIndicadores {
  return {
    estado: "ACEPTADA",
    estadoPrevioDisputa: null,
    montoBruto: 100_000,
    montoMedio: 80_000,
    aceptadaAt: "2026-09-10T15:00:00Z",
    verificadaAt: null,
    ...parcial,
  }
}

describe("indicadoresAsignaciones", () => {
  it("agrupa por estado y separa GMV verificado y comprometido", () => {
    const resultado = indicadoresAsignaciones(
      [
        asignacion({ estado: "ACEPTADA" }),
        asignacion({ estado: "PUBLICADA", montoBruto: 50_000 }),
        asignacion({
          estado: "VERIFICADA",
          montoBruto: 200_000,
          verificadaAt: "2026-09-20T15:00:00Z",
        }),
        asignacion({ estado: "PAGADA", montoBruto: 300_000 }),
        asignacion({ estado: "RECHAZADA", aceptadaAt: null }),
        asignacion({ estado: "VENCIDA_SIN_PUBLICAR" }),
      ],
      AHORA
    )
    expect(resultado.total).toBe(6)
    expect(resultado.porGrupo).toEqual({
      en_curso: 1,
      por_revisar: 1,
      cumplidas: 2,
      en_disputa: 0,
      caidas: 2,
    })
    expect(resultado.gmvVerificado).toBe(500_000)
    // Consumen cupo: aceptada, publicada, verificada y pagada.
    expect(resultado.gmvComprometido).toBe(650_000)
    expect(resultado.ticketPromedio).toBe(250_000)
  })

  it("una disputa sobre una vencida no vuelve a consumir cupo", () => {
    const resultado = indicadoresAsignaciones(
      [
        asignacion({
          estado: "EN_DISPUTA",
          estadoPrevioDisputa: "VENCIDA_SIN_PUBLICAR",
        }),
        asignacion({ estado: "EN_DISPUTA", estadoPrevioDisputa: "PUBLICADA" }),
      ],
      AHORA
    )
    expect(resultado.porGrupo.en_disputa).toBe(2)
    expect(resultado.gmvComprometido).toBe(100_000)
  })

  it("el consumo del tope solo cuenta lo aceptado este año (Bogotá) y visible", () => {
    const resultado = indicadoresAsignaciones(
      [
        asignacion({ montoMedio: 80_000 }),
        // 23:30 del 31-dic-2025 en Bogotá: año anterior aunque en UTC ya sea 2026.
        asignacion({ aceptadaAt: "2026-01-01T04:30:00Z", montoMedio: 70_000 }),
        asignacion({ montoMedio: null }),
      ],
      AHORA
    )
    expect(resultado.consumidoAnio).toBe(80_000)
  })

  it("sin cumplidas no hay ticket promedio", () => {
    expect(indicadoresAsignaciones([], AHORA).ticketPromedio).toBeNull()
  })
})

describe("serieMensual", () => {
  it("devuelve los últimos meses (incluidos los vacíos) en hora de Bogotá", () => {
    const serie = serieMensual(
      [
        asignacion({ aceptadaAt: "2026-09-01T04:00:00Z" }), // 31-ago en Bogotá
        asignacion({
          estado: "PAGADA",
          aceptadaAt: "2026-09-05T15:00:00Z",
          verificadaAt: "2026-09-25T15:00:00Z",
          montoBruto: 120_000,
        }),
        asignacion({ aceptadaAt: "2025-01-10T15:00:00Z" }), // fuera de la ventana
      ],
      3,
      AHORA
    )
    expect(serie.map((punto) => punto.periodo)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ])
    expect(serie[1].aceptadas).toBe(1)
    expect(serie[2]).toMatchObject({ aceptadas: 1, gmvVerificado: 120_000 })
    expect(serie[2].etiqueta).toMatch(/sept/)
    expect(serieConDatos(serie)).toBe(true)
    expect(serieConDatos(serieMensual([], 3, AHORA))).toBe(false)
  })

  it("solo suma GMV de las cumplidas", () => {
    const serie = serieMensual(
      [
        asignacion({
          estado: "CANCELADA",
          verificadaAt: "2026-09-25T15:00:00Z",
        }),
      ],
      1,
      AHORA
    )
    expect(serie[0].gmvVerificado).toBe(0)
  })
})

describe("vigenciaVerificacion", () => {
  const verificada = (diasAtras: number) =>
    new Date(AHORA.getTime() - diasAtras * 86_400_000).toISOString()

  it("sin verificación no es elegible", () => {
    expect(vigenciaVerificacion(null, 30, 7, AHORA)).toEqual({
      vigencia: "sin_verificar",
      venceAt: null,
      elegibleHasta: null,
    })
  })

  it("vigente, por vencer, en gracia y vencida", () => {
    expect(vigenciaVerificacion(verificada(10), 30, 7, AHORA).vigencia).toBe(
      "vigente"
    )
    expect(vigenciaVerificacion(verificada(26), 30, 7, AHORA).vigencia).toBe(
      "por_vencer"
    )
    expect(vigenciaVerificacion(verificada(32), 30, 7, AHORA).vigencia).toBe(
      "en_gracia"
    )
    expect(vigenciaVerificacion(verificada(37), 30, 7, AHORA).vigencia).toBe(
      "vencida"
    )
  })

  it("calcula el vencimiento y el último día elegible", () => {
    const resultado = vigenciaVerificacion("2026-09-01T00:00:00Z", 30, 7, AHORA)
    expect(resultado.venceAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(resultado.elegibleHasta?.toISOString()).toBe(
      "2026-10-08T00:00:00.000Z"
    )
  })
})

describe("proporcion y cupos", () => {
  it("acota entre 0 y 1 y devuelve null sin base", () => {
    expect(proporcion(3, 4)).toBe(0.75)
    expect(proporcion(5, 4)).toBe(1)
    expect(proporcion(-1, 4)).toBe(0)
    expect(proporcion(1, 0)).toBeNull()
    expect(proporcion(Number.NaN, 4)).toBeNull()
  })

  it("ordena las franjas y suma el llenado", () => {
    const resumen = resumirCupos([
      {
        franjaId: "b",
        clave: "F2",
        nombre: "60–120 mil",
        orden: 2,
        totales: 4,
        ocupados: 4,
      },
      {
        franjaId: "a",
        clave: "F1",
        nombre: "30–60 mil",
        orden: 1,
        totales: 6,
        ocupados: 2,
      },
    ])
    expect(resumen.franjas.map((franja) => franja.clave)).toEqual(["F1", "F2"])
    expect(resumen).toMatchObject({
      totales: 10,
      ocupados: 6,
      libres: 4,
      llenado: 0.6,
    })
    expect(resumirCupos([]).llenado).toBeNull()
  })
})

describe("resumirCartera", () => {
  it("ignora borradores y anuladas y reparte el saldo por antigüedad", () => {
    const resumen = resumirCartera(
      [
        { estado: "BORRADOR", total: 999, pagado: 0, fechaVencimiento: null },
        {
          estado: "ANULADA",
          total: 999,
          pagado: 0,
          fechaVencimiento: "2026-01-01",
        },
        {
          estado: "EMITIDA",
          total: 1_000,
          pagado: 0,
          fechaVencimiento: "2026-10-15",
        },
        {
          estado: "PAGADA_PARCIAL",
          total: 2_000,
          pagado: 500,
          fechaVencimiento: "2026-08-20",
        },
        {
          estado: "VENCIDA",
          total: 3_000,
          pagado: 0,
          fechaVencimiento: "2026-06-01",
        },
        {
          estado: "PAGADA",
          total: 4_000,
          pagado: 4_000,
          fechaVencimiento: "2026-05-01",
        },
      ],
      AHORA
    )
    expect(resumen.facturado).toBe(10_000)
    expect(resumen.pagado).toBe(4_500)
    expect(resumen.saldo).toBe(5_500)
    expect(resumen.porTramo).toEqual({
      "0_30": 1_000,
      "31_60": 1_500,
      "61_90": 0,
      "90_mas": 3_000,
    })
    expect(resumen.facturasVencidas).toBe(2)
  })
})

describe("diasHasta y avisoVencimiento", () => {
  it("cuenta días de calendario de Bogotá, no tramos de 24 horas", () => {
    expect(diasHasta("2026-09-30", AHORA)).toBe(0)
    expect(diasHasta("2026-10-01", AHORA)).toBe(1)
    expect(diasHasta("2026-09-29", AHORA)).toBe(-1)
    // 23:30 del 30-sep en Bogotá ya es 1-oct en UTC: sigue siendo "hoy".
    expect(diasHasta("2026-09-30", new Date("2026-10-01T04:30:00Z"))).toBe(0)
    // 00:10 del 1-oct en Bogotá: el 30-sep ya fue ayer.
    expect(diasHasta("2026-09-30", new Date("2026-10-01T05:10:00Z"))).toBe(-1)
  })

  it("distingue vencido, hoy, mañana y pronto; calla si falta más de 30 días", () => {
    expect(avisoVencimiento(null, AHORA)).toBeNull()
    expect(avisoVencimiento("2026-09-29", AHORA)).toEqual({
      aviso: "vencido",
      dias: -1,
    })
    expect(avisoVencimiento("2026-09-30", AHORA)).toEqual({
      aviso: "hoy",
      dias: 0,
    })
    expect(avisoVencimiento("2026-10-01", AHORA)).toEqual({
      aviso: "manana",
      dias: 1,
    })
    expect(avisoVencimiento("2026-10-18", AHORA)).toEqual({
      aviso: "pronto",
      dias: 18,
    })
    expect(avisoVencimiento("2026-10-30", AHORA)).toEqual({
      aviso: "pronto",
      dias: 30,
    })
    expect(avisoVencimiento("2026-10-31", AHORA)).toBeNull()
  })
})

describe("situacionTope", () => {
  const base = { tope: 30_000_000, alerta: 0.8, bloqueo: 0.95 }

  it("normal, alerta y bloqueo según las fracciones del nivel", () => {
    expect(situacionTope({ ...base, consumido: 6_000_000 })).toEqual({
      fraccion: 0.2,
      situacion: "normal",
    })
    expect(situacionTope({ ...base, consumido: 24_000_000 }).situacion).toBe(
      "alerta"
    )
    expect(situacionTope({ ...base, consumido: 29_000_000 }).situacion).toBe(
      "bloqueo"
    )
  })

  it("sin tope (nivel 3) no hay fracción", () => {
    expect(situacionTope({ ...base, tope: null, consumido: 1 })).toEqual({
      fraccion: null,
      situacion: "sin_tope",
    })
  })
})
