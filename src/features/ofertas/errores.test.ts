import { describe, expect, it } from "vitest"

import { MENSAJES_NEGOCIO } from "@/lib/errores-bd"

import { interpretarErrorOferta } from "./errores"

describe("interpretarErrorOferta", () => {
  it("un envío rechazado trae el paso y el detalle de la BD", () => {
    expect(
      interpretarErrorOferta({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "Carga el paquete creativo con al menos un archivo.",
        hint: "envio_oferta:creativo",
      })
    ).toEqual({
      mensaje: "Carga el paquete creativo con al menos un archivo.",
      paso: "creativo",
      esperado: true,
    })
  })

  it("el presupuesto por encima de lo disponible lleva a «Cuánto»", () => {
    const error = interpretarErrorOferta({
      code: "P0001",
      message: "AMO_PRESUPUESTO_CAMPANA",
      details:
        "El presupuesto de la oferta supera lo que queda disponible en la campaña.",
      hint: "envio_oferta:cuanto",
    })
    expect(error.paso).toBe("cuanto")
    expect(error.mensaje).toMatch(/supera lo que queda disponible/)
  })

  it("sin motivo, el mensaje va al campo del motivo", () => {
    expect(
      interpretarErrorOferta({
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
        details: null,
      })
    ).toEqual({
      mensaje: MENSAJES_NEGOCIO.AMO_MOTIVO_REQUERIDO,
      campo: "motivo",
      paso: null,
      esperado: true,
    })
  })

  it("una cancelación con asignaciones explica por qué", () => {
    expect(
      interpretarErrorOferta({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "La oferta ya tiene asignaciones: no se puede cancelar.",
      })
    ).toMatchObject({
      mensaje: "La oferta ya tiene asignaciones: no se puede cancelar.",
      paso: null,
    })
  })

  it("un comentario demasiado largo se marca en el motivo", () => {
    expect(
      interpretarErrorOferta({
        code: "23514",
        message:
          'new row for relation "ofertas" violates check constraint "ofertas_comentario_chk"',
      })
    ).toMatchObject({ campo: "motivo", esperado: true })
  })

  it("un error desconocido no es esperado", () => {
    expect(
      interpretarErrorOferta({ code: "XX000", message: "boom" }).esperado
    ).toBe(false)
  })
})
