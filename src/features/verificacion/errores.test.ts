import { describe, expect, it } from "vitest"

import { interpretarErrorVerificacion } from "./errores"

describe("interpretarErrorVerificacion", () => {
  it("usa el detalle de la BD con los documentos en lenguaje claro", () => {
    expect(
      interpretarErrorVerificacion({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "Faltan documentos aprobados y vigentes: CEDULA_FRENTE, PRUEBA_VIDA, CERT_BILLETERA.",
      })
    ).toEqual({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje:
        "Faltan documentos aprobados y vigentes: Cédula (frente), Prueba de vida, Certificación de billetera.",
    })
  })

  it("lleva la clasificación repetida al campo del municipio", () => {
    expect(
      interpretarErrorVerificacion({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "medio_pertinencia_geografica_pkey"',
      })
    ).toMatchObject({ esperado: true, campo: "municipioCodigo" })
  })

  it("sin detalle usa el catálogo común", () => {
    expect(
      interpretarErrorVerificacion({
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
      }).mensaje
    ).toBe("Indica el motivo del cambio.")
  })

  it("un error desconocido no es esperado", () => {
    expect(
      interpretarErrorVerificacion({ code: "XX000", message: "boom" })
    ).toMatchObject({ esperado: false })
  })
})
