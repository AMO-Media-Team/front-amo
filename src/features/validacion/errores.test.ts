import { describe, expect, it } from "vitest"

import { frasePermanenciaPendiente } from "./decision"
import {
  elementoCambiado,
  esperaDisputa,
  interpretarErrorValidacion,
  MENSAJES_VALIDACION,
} from "./errores"

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

  it("el medio cambió lo que se revisaba: se explica, es esperado y no va a un campo", () => {
    expect(
      interpretarErrorValidacion({
        ...TRANSICION,
        details:
          "El medio cambió esta evidencia mientras la revisabas: vuelve a abrirla para revisar la versión actual.",
        hint: "evidencia_cambiada",
      })
    ).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje: MENSAJES_VALIDACION.evidenciaCambiada,
    })
    expect(
      interpretarErrorValidacion({ ...TRANSICION, hint: "metrica_cambiada" })
    ).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje: MENSAJES_VALIDACION.metricaCambiada,
    })
  })

  it("en disputa: dice qué espera a la disputa según lo que se decidía", () => {
    const enDisputa = {
      ...TRANSICION,
      details:
        "La asignación está en disputa: decide sobre la evidencia al resolverla.",
      hint: "en_disputa",
    }
    expect(interpretarErrorValidacion(enDisputa)).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje: MENSAJES_VALIDACION.enDisputaEvidencia,
    })
    expect(
      interpretarErrorValidacion(enDisputa, { enDisputa: "rechazoMetrica" })
        .mensaje
    ).toBe(MENSAJES_VALIDACION.enDisputaRechazoMetrica)
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

describe("esperaDisputa", () => {
  it("reconoce el fallo `en_disputa` de cada decisión", () => {
    const evidencia = {
      ok: false,
      error: MENSAJES_VALIDACION.enDisputaEvidencia,
    }
    expect(esperaDisputa(evidencia, "evidencia")).toBe(true)
    expect(esperaDisputa(evidencia, "rechazoMetrica")).toBe(false)
    expect(
      esperaDisputa(
        { ok: false, error: MENSAJES_VALIDACION.enDisputaRechazoMetrica },
        "rechazoMetrica"
      )
    ).toBe(true)
    expect(esperaDisputa({ ok: true }, "evidencia")).toBe(false)
    expect(
      esperaDisputa(
        { ok: false, error: MENSAJES_VALIDACION.asignacionCerrada },
        "evidencia"
      )
    ).toBe(false)
  })
})

describe("elementoCambiado", () => {
  it("reconoce el fallo de cada elemento y nada más", () => {
    const evidencia = {
      ok: false,
      error: MENSAJES_VALIDACION.evidenciaCambiada,
    }
    expect(elementoCambiado(evidencia, "evidencia")).toBe(true)
    expect(elementoCambiado(evidencia, "metrica")).toBe(false)
    expect(
      elementoCambiado(
        { ok: false, error: MENSAJES_VALIDACION.metricaCambiada },
        "metrica"
      )
    ).toBe(true)
    expect(elementoCambiado({ ok: true }, "evidencia")).toBe(false)
    expect(
      elementoCambiado(
        { ok: false, error: MENSAJES_VALIDACION.enDisputaEvidencia },
        "evidencia"
      )
    ).toBe(false)
  })
})
