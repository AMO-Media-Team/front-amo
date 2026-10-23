import { describe, expect, it } from "vitest"

import { VALORES_VACIOS } from "./campos-metricas"
import {
  admiteGuardar,
  cortesComparables,
  diaDe,
  metricaDelCorte,
  periodoPersonalizado,
  situacionMetricas,
} from "./metricas"
import type {
  Corte,
  EstadoAsignacion,
  EstadoValidacion,
  MetricaEjecucion,
} from "./tipos"

const AHORA = new Date("2026-10-23T15:00:00.000Z")
const PUBLICADA_HACE_DOS_DIAS = "2026-10-21T14:00:00.000Z"

function asignacion(
  estado: EstadoAsignacion = "PUBLICADA",
  cortesRequeridos: Corte[] = ["H24", "H72", "D7"]
) {
  return { estado, cortesRequeridos }
}

function publicacion(
  estado: EstadoValidacion = "PENDIENTE",
  fechaPublicacion = PUBLICADA_HACE_DOS_DIAS
) {
  return { estado, fechaPublicacion }
}

function metrica(cambios: Partial<MetricaEjecucion> = {}): MetricaEjecucion {
  return {
    id: "m1",
    corte: "H24",
    fechaCorte: "2026-10-22T15:00:00.000Z",
    periodoDesde: null,
    periodoHasta: null,
    valores: { ...VALORES_VACIOS, alcance: 100, impresiones: 150, meGusta: 5 },
    estado: "PENDIENTE",
    observaciones: null,
    conMiniatura: true,
    ...cambios,
  }
}

describe("situacionMetricas", () => {
  it("un corte que la oferta no pide no se carga", () => {
    expect(
      situacionMetricas(
        asignacion("PUBLICADA", ["H24"]),
        publicacion(),
        "D7",
        null,
        AHORA
      )
    ).toEqual({ tipo: "corte-no-pedido" })
  })

  it("sin evidencia no hay métricas", () => {
    expect(situacionMetricas(asignacion(), null, "H24", null, AHORA)).toEqual({
      tipo: "sin-evidencia",
    })
  })

  it("el corte de 24 h ya está disponible y el de 72 h espera su hora", () => {
    expect(
      situacionMetricas(asignacion(), publicacion(), "H24", null, AHORA)
    ).toEqual({ tipo: "cargar" })
    expect(
      situacionMetricas(asignacion(), publicacion(), "H72", null, AHORA)
    ).toEqual({ tipo: "bloqueada", desde: "2026-10-24T14:00:00.000Z" })
  })

  it("el personalizado no espera", () => {
    expect(
      situacionMetricas(
        asignacion("EVIDENCIA_VALIDADA"),
        publicacion("APROBADA", "2026-10-23T14:00:00.000Z"),
        "PERSONALIZADO",
        null,
        AHORA
      )
    ).toEqual({ tipo: "cargar" })
  })

  it("se corrige una pendiente o una rechazada; una aprobada no", () => {
    expect(
      situacionMetricas(asignacion(), publicacion(), "H24", metrica(), AHORA)
    ).toEqual({ tipo: "en-revision" })
    expect(
      situacionMetricas(
        asignacion("EVIDENCIA_VALIDADA"),
        publicacion("APROBADA"),
        "H24",
        metrica({ estado: "RECHAZADA", observaciones: "Falta la fecha." }),
        AHORA
      )
    ).toEqual({ tipo: "corregir", observaciones: "Falta la fecha." })
    expect(
      situacionMetricas(
        asignacion("VERIFICADA"),
        publicacion("APROBADA"),
        "H24",
        metrica({ estado: "APROBADA" }),
        AHORA
      )
    ).toEqual({ tipo: "aprobada" })
  })

  it("con la evidencia rechazada, primero se corrige la evidencia", () => {
    expect(
      situacionMetricas(
        asignacion("CONTENIDO_ENTREGADO"),
        publicacion("RECHAZADA"),
        "H24",
        null,
        AHORA
      )
    ).toEqual({ tipo: "evidencia-rechazada" })
  })

  it("si falta la evidencia de otra publicación, espera", () => {
    expect(
      situacionMetricas(
        asignacion("CONTENIDO_ENTREGADO"),
        publicacion("PENDIENTE"),
        "H24",
        null,
        AHORA
      )
    ).toEqual({ tipo: "faltan-evidencias" })
  })

  it("una asignación verificada o cancelada ya no admite métricas", () => {
    for (const estado of ["VERIFICADA", "CANCELADA", "EN_DISPUTA"] as const) {
      expect(
        situacionMetricas(
          asignacion(estado),
          publicacion("APROBADA"),
          "H24",
          null,
          AHORA
        )
      ).toEqual({ tipo: "cerrada" })
    }
  })

  it("admiteGuardar en cargar, corregir y en revisión", () => {
    expect(admiteGuardar({ tipo: "cargar" })).toBe(true)
    expect(admiteGuardar({ tipo: "en-revision" })).toBe(true)
    expect(admiteGuardar({ tipo: "corregir", observaciones: null })).toBe(true)
    expect(admiteGuardar({ tipo: "aprobada" })).toBe(false)
    expect(admiteGuardar({ tipo: "bloqueada", desde: "" })).toBe(false)
  })
})

describe("metricaDelCorte", () => {
  const metricas = [
    metrica({ id: "a", corte: "H24" }),
    metrica({ id: "b", corte: "PERSONALIZADO" }),
  ]

  it("el fijo se busca por corte; el personalizado, por id", () => {
    expect(metricaDelCorte(metricas, "H24", null)?.id).toBe("a")
    expect(metricaDelCorte(metricas, "H72", null)).toBeNull()
    expect(metricaDelCorte(metricas, "PERSONALIZADO", null)).toBeNull()
    expect(metricaDelCorte(metricas, "PERSONALIZADO", "b")?.id).toBe("b")
    expect(metricaDelCorte(metricas, "PERSONALIZADO", "a")).toBeNull()
  })
})

describe("cortesComparables", () => {
  it("usa las cifras normalizadas de la BD", () => {
    expect(cortesComparables([metrica()])).toEqual([
      {
        id: "m1",
        corte: "H24",
        estado: "PENDIENTE",
        alcance: 100,
        impresiones: 150,
        interacciones: 5,
      },
    ])
  })
})

describe("periodoPersonalizado", () => {
  it("va del inicio del primer día al fin del último en Bogotá", () => {
    expect(
      periodoPersonalizado(
        "2026-10-21",
        "2026-10-22",
        "2026-10-23T15:00:00.000Z"
      )
    ).toEqual({
      desde: "2026-10-21T05:00:00.000Z",
      hasta: "2026-10-23T05:00:00.000Z",
    })
  })

  it("si el último día es el de la captura, termina en la captura", () => {
    expect(
      periodoPersonalizado(
        "2026-10-21",
        "2026-10-23",
        "2026-10-23T15:00:00.000Z"
      )
    ).toEqual({
      desde: "2026-10-21T05:00:00.000Z",
      hasta: "2026-10-23T15:00:00.000Z",
    })
  })

  it("es null con días inválidos", () => {
    expect(
      periodoPersonalizado("", "2026-10-22", AHORA.toISOString())
    ).toBeNull()
    expect(
      periodoPersonalizado("2026-02-30", "2026-03-01", AHORA.toISOString())
    ).toBeNull()
  })

  it("diaDe da el día de Bogotá", () => {
    expect(diaDe("2026-10-23T03:00:00.000Z")).toBe("2026-10-22")
  })
})
