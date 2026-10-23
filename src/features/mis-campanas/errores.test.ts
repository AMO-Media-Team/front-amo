import { describe, expect, it } from "vitest"

import { MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import { interpretarErrorMisCampanas } from "./errores"

describe("interpretarErrorMisCampanas", () => {
  it("el detalle de la BD siempre manda", () => {
    expect(
      interpretarErrorMisCampanas({
        code: "P0001",
        message: "AMO_FUERA_DE_VENTANA",
        details:
          "Venció el plazo para publicar: ya no puedes descargar el contenido.",
      })
    ).toMatchObject({
      codigo: "AMO_FUERA_DE_VENTANA",
      esperado: true,
      mensaje:
        "Venció el plazo para publicar: ya no puedes descargar el contenido.",
    })
  })

  it("sin detalle, el respaldo en voz del medio", () => {
    expect(
      interpretarErrorMisCampanas({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
      }).mensaje
    ).toMatch(/^Esta campaña cambió de estado/)
    expect(
      interpretarErrorMisCampanas({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
      }).mensaje
    ).toBe(MENSAJE_SIN_PERMISO)
  })

  it("lo inesperado no es esperado (se registra)", () => {
    expect(
      interpretarErrorMisCampanas({ code: "XX000", message: "boom" })
    ).toMatchObject({ codigo: null, esperado: false })
  })
})
