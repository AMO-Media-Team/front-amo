import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO, MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import { interpretarErrorGanancias, MENSAJES_GANANCIAS } from "./errores"

describe("interpretarErrorGanancias", () => {
  it("el PDF que no llegó va al campo del archivo", () => {
    expect(
      interpretarErrorGanancias({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Carga el PDF de la factura.",
        hint: "archivo_no_cargado",
      })
    ).toEqual({
      codigo: "AMO_CONFIG_INVALIDA",
      esperado: true,
      mensaje: MENSAJES_GANANCIAS.archivoNoCargado,
      campo: "archivo",
    })
  })

  it("el número que pide la BD va al campo del número", () => {
    expect(
      interpretarErrorGanancias({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Indica el número de la factura.",
      })
    ).toMatchObject({
      mensaje: "Indica el número de la factura.",
      campo: "numero",
      esperado: true,
    })
  })

  it("una liquidación que ya no admite cambios queda como error general", () => {
    const interpretado = interpretarErrorGanancias({
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "La liquidación ya no admite cambios.",
    })
    expect(interpretado).toMatchObject({
      mensaje: "La liquidación ya no admite cambios.",
      esperado: true,
    })
    expect(interpretado.campo).toBeUndefined()
  })

  it("sin permiso o inesperado, sin detalles técnicos", () => {
    expect(
      interpretarErrorGanancias({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
      }).mensaje
    ).toBe(MENSAJE_SIN_PERMISO)
    expect(
      interpretarErrorGanancias({ code: "XX000", message: "boom" })
    ).toMatchObject({ mensaje: MENSAJE_INESPERADO, esperado: false })
  })
})
