import { describe, expect, it } from "vitest"

import {
  interpretarErrorEnvio,
  interpretarErrorGuardado,
  RESTRICCIONES_OFERTA,
} from "./errores"
import { pasoDeCampo } from "./pasos"

describe("interpretarErrorEnvio", () => {
  it("lleva al paso que señala la BD con su mensaje", () => {
    expect(
      interpretarErrorEnvio({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "Carga el paquete creativo con al menos un archivo.",
        hint: "envio_oferta:creativo",
      })
    ).toEqual({
      paso: "creativo",
      mensaje: "Carga el paquete creativo con al menos un archivo.",
      esperado: true,
    })
  })

  it("el presupuesto por encima de lo disponible va a «Cuánto»", () => {
    expect(
      interpretarErrorEnvio({
        code: "P0001",
        message: "AMO_PRESUPUESTO_CAMPANA",
        details:
          "El presupuesto de la oferta supera lo que queda disponible en la campaña.",
        hint: "envio_oferta:cuanto",
      }).paso
    ).toBe("cuanto")
  })

  it("la anticipación de la fecha límite va a «Cuándo» con el número de horas", () => {
    const error = interpretarErrorEnvio({
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details:
        "La fecha límite de aceptación debe quedar al menos 24 horas después del envío.",
      hint: "envio_oferta:cuando",
    })
    expect(error.paso).toBe("cuando")
    expect(error.mensaje).toMatch(/24 horas/)
  })

  it("sin pista (permiso, sesión) el error se muestra en el envío", () => {
    expect(
      interpretarErrorEnvio({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details: null,
        hint: null,
      })
    ).toMatchObject({ paso: "envio", esperado: true })
    expect(
      interpretarErrorEnvio({ code: "08006", message: "conexión perdida" })
    ).toMatchObject({ paso: "envio", esperado: false })
  })
})

describe("interpretarErrorGuardado", () => {
  it("lleva cada restricción de la BD a su campo", () => {
    expect(
      interpretarErrorGuardado({
        code: "23514",
        message:
          'new row for relation "ofertas" violates check constraint "ofertas_fecha_limite_chk"',
      })
    ).toMatchObject({ campo: "cuando.fechaLimite", esperado: true })
  })

  it("cada campo de las restricciones pertenece a un paso del asistente", () => {
    for (const valor of Object.values(RESTRICCIONES_OFERTA)) {
      if (typeof valor === "string" || !valor.campo) continue
      expect(["que", "quien", "cuando", "cuanto", "envio"]).toContain(
        pasoDeCampo(valor.campo)
      )
    }
  })
})
