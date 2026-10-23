import { describe, expect, it } from "vitest"

import { interpretarErrorDisputa, MENSAJES_DISPUTA } from "./errores"

describe("interpretarErrorDisputa", () => {
  it("da texto propio a los hint de la fase 4", () => {
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "La oferta ya cerró: resuelve restaurando la decisión o cancelando la asignación.",
        hint: "oferta_cerrada",
      })
    ).toEqual({ mensaje: MENSAJES_DISPUTA.ofertaCerrada, esperado: true })
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        hint: "metricas_pendientes",
      }).mensaje
    ).toBe(MENSAJES_DISPUTA.metricasPendientes)
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        hint: "asignacion_cerrada",
      }).mensaje
    ).toBe(MENSAJES_DISPUTA.asignacionCerrada)
  })

  it("la permanencia pendiente se explica con la salida de la constancia", () => {
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_PERMANENCIA_PENDIENTE",
        details: "Aún no se cumple la permanencia mínima de la publicación.",
      })
    ).toEqual({
      mensaje: MENSAJES_DISPUTA.permanenciaPendiente,
      esperado: true,
    })
  })

  it("usa el detalle de la BD y ubica el campo del motivo o de la causa", () => {
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "Ya hay una disputa abierta sobre esta asignación.",
      })
    ).toEqual({
      mensaje: "Ya hay una disputa abierta sobre esta asignación.",
      esperado: true,
    })
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
        details: "Indica la causa de la cancelación.",
      })
    ).toMatchObject({ campo: "causa" })
    expect(
      interpretarErrorDisputa({
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
        details: "Indica el motivo del cambio.",
      })
    ).toMatchObject({ campo: "motivo" })
  })

  it("traduce las restricciones de las tablas de disputas", () => {
    expect(
      interpretarErrorDisputa({
        code: "23514",
        message:
          'new row for relation "disputa_mensajes" violates check constraint "disputa_mensajes_adjunto_chk"',
      })
    ).toEqual({
      mensaje: MENSAJES_DISPUTA.adjuntoAjeno,
      campo: "adjunto",
      esperado: true,
    })
  })

  it("lo desconocido no es esperado (se registra)", () => {
    expect(
      interpretarErrorDisputa({ code: "XX000", message: "boom" }).esperado
    ).toBe(false)
  })
})
