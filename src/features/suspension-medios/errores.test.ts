import { describe, expect, it } from "vitest"

import { MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import { interpretarErrorSuspension, MENSAJES_SUSPENSION } from "./errores"

describe("interpretarErrorSuspension", () => {
  it("un medio que cambió de estado mientras tanto se explica según la acción", () => {
    const error = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "El registro no puede pasar a ese estado desde el actual.",
    }
    expect(interpretarErrorSuspension(error, "suspender")).toMatchObject({
      codigo: "AMO_TRANSICION_INVALIDA",
      esperado: true,
      mensaje: MENSAJES_SUSPENSION.yaNoVerificado,
    })
    expect(interpretarErrorSuspension(error, "reactivar").mensaje).toBe(
      MENSAJES_SUSPENSION.yaNoSuspendido
    )
  })

  it("el motivo demasiado largo se asocia a su campo", () => {
    expect(
      interpretarErrorSuspension(
        {
          code: "23514",
          message:
            'new row for relation "medios" violates check constraint "medios_motivo_estado_chk"',
        },
        "suspender"
      )
    ).toMatchObject({
      campo: "motivo",
      mensaje: "El motivo admite hasta 500 caracteres.",
      esperado: true,
    })
  })

  it("los demás errores de negocio usan el detalle de la BD", () => {
    expect(
      interpretarErrorSuspension(
        {
          code: "P0001",
          message: "AMO_NO_AUTORIZADO",
          details: "No tienes permiso para esta acción.",
        },
        "reactivar"
      ).mensaje
    ).toBe("No tienes permiso para esta acción.")
    expect(
      interpretarErrorSuspension(
        { code: "P0001", message: "AMO_NO_AUTORIZADO" },
        "reactivar"
      ).mensaje
    ).toBe(MENSAJE_SIN_PERMISO)
  })
})
