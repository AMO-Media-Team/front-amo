import { describe, expect, it } from "vitest"

import { frasePermanenciaPendiente } from "./decision"
import { interpretarErrorValidacion, MENSAJES_VALIDACION } from "./errores"

const TRANSICION = {
  code: "P0001",
  message: "AMO_TRANSICION_INVALIDA",
}

describe("interpretarErrorValidacion", () => {
  it("da texto propio a los hint de la fase", () => {
    expect(
      interpretarErrorValidacion({
        ...TRANSICION,
        details: "La asignación ya no está en curso: no hay nada que validar.",
        hint: "asignacion_cerrada",
      })
    ).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje: MENSAJES_VALIDACION.asignacionCerrada,
    })
    expect(
      interpretarErrorValidacion({
        ...TRANSICION,
        hint: "metricas_pendientes",
      }).mensaje
    ).toBe(MENSAJES_VALIDACION.metricasPendientes)
  })

  it("una alerta sin revisar va al campo de las observaciones", () => {
    expect(
      interpretarErrorValidacion({
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
        hint: "alerta_sin_revision",
      })
    ).toMatchObject({
      mensaje: MENSAJES_VALIDACION.alertaSinRevision,
      campo: "observaciones",
      esperado: true,
    })
  })

  it("la permanencia pendiente dice hasta cuándo (ADM-009 c1)", () => {
    const hasta = "2026-10-24T15:00:00Z"
    const error = {
      code: "P0001",
      message: "AMO_PERMANENCIA_PENDIENTE",
      details: "Aún no se cumple la permanencia mínima de la publicación.",
    }
    expect(
      interpretarErrorValidacion(error, { permanenciaHasta: hasta }).mensaje
    ).toBe(frasePermanenciaPendiente(hasta))
    expect(interpretarErrorValidacion(error).mensaje).toBe(
      MENSAJES_VALIDACION.permanenciaPendiente
    )
  })

  it("la etiqueta requerida va a su casilla; el motivo, al campo que se indique", () => {
    expect(
      interpretarErrorValidacion({
        code: "P0001",
        message: "AMO_ETIQUETA_REQUERIDA",
      })
    ).toMatchObject({
      campo: "etiquetaVerificada",
      mensaje: MENSAJES_VALIDACION.etiquetaRequerida,
    })
    expect(
      interpretarErrorValidacion(
        {
          code: "P0001",
          message: "AMO_MOTIVO_REQUERIDO",
          details: "Explica qué corriges y por qué.",
        },
        { campoMotivo: "motivo" }
      )
    ).toMatchObject({
      campo: "motivo",
      mensaje: "Explica qué corriges y por qué.",
    })
  })

  it("traduce las restricciones de métricas que una corrección puede violar", () => {
    expect(
      interpretarErrorValidacion({
        code: "23514",
        message:
          'new row for relation "metricas" violates check constraint "metricas_alcance_impresiones_chk"',
      })
    ).toMatchObject({ campo: "impresiones", esperado: true })
  })

  it("lo inesperado no se muestra crudo", () => {
    const interpretado = interpretarErrorValidacion({
      code: "XX000",
      message: "internal error at public.metricas",
    })
    expect(interpretado.esperado).toBe(false)
    expect(interpretado.mensaje).not.toMatch(/metricas/)
  })
})
