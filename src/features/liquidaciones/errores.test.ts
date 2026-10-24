import { describe, expect, it } from "vitest"

import {
  interpretarErrorLiquidacion,
  MENSAJE_MEDIO_SIN_LIQUIDAR,
  MENSAJES_LIQUIDACION,
  textoErrorCorte,
} from "./errores"
import { TEXTO_REQUIERE_NOTA_AJUSTE } from "./presentacion"

describe("interpretarErrorLiquidacion", () => {
  it("periodo abierto: el detalle de la BD, en el último día", () => {
    expect(
      interpretarErrorLiquidacion(
        {
          message: "AMO_TRANSICION_INVALIDA",
          details: "El periodo aún no termina: liquídalo desde su último día.",
          hint: "periodo_abierto",
        },
        "liquidar"
      )
    ).toMatchObject({
      mensaje: "El periodo aún no termina: liquídalo desde su último día.",
      campo: "fin",
      esperado: true,
      requiereNotaAjuste: false,
    })
  })

  it("D17: el detalle de la BD tal cual", () => {
    expect(
      interpretarErrorLiquidacion(
        {
          message: "AMO_NO_AUTORIZADO",
          details: "Quien genera una liquidación no puede aprobarla.",
        },
        "aprobar"
      ).mensaje
    ).toBe("Quien genera una liquidación no puede aprobarla.")
  })

  it("seguridad social con el rótulo del RF", () => {
    expect(
      interpretarErrorLiquidacion(
        {
          message: "AMO_SEG_SOCIAL_PENDIENTE",
          details:
            "El medio supera el umbral mensual y no tiene la seguridad social aprobada.",
        },
        "aprobar"
      ).mensaje
    ).toBe(
      "Seguridad social pendiente: el medio supera el umbral mensual y no tiene la seguridad social aprobada."
    )
  })

  it("nota de ajuste pendiente: lleva a la sección del documento", () => {
    expect(
      interpretarErrorLiquidacion(
        {
          message: "AMO_TRANSICION_INVALIDA",
          details: "El documento soporte ya se transmitió…",
          hint: "requiere_nota_ajuste",
        },
        "anular"
      )
    ).toMatchObject({
      mensaje: TEXTO_REQUIERE_NOTA_AJUSTE,
      requiereNotaAjuste: true,
    })
  })

  it("factura: archivo sin cargar y número que la BD no admite, en su campo", () => {
    expect(
      interpretarErrorLiquidacion(
        {
          message: "AMO_CONFIG_INVALIDA",
          details: "Carga el PDF de la factura.",
          hint: "archivo_no_cargado",
        },
        "factura"
      )
    ).toMatchObject({
      mensaje: MENSAJES_LIQUIDACION.archivoNoCargado,
      campo: "archivo",
    })
    expect(
      interpretarErrorLiquidacion(
        {
          message: "AMO_CONFIG_INVALIDA",
          details: "Indica el número de la factura.",
        },
        "factura"
      )
    ).toMatchObject({
      mensaje: "Indica el número de la factura.",
      campo: "numero",
    })
  })

  it("integridad rota: qué hacer", () => {
    expect(
      interpretarErrorLiquidacion(
        { message: "AMO_TRANSICION_INVALIDA", hint: "liquidacion_integridad" },
        "aprobar"
      ).mensaje
    ).toBe(MENSAJES_LIQUIDACION.integridad)
  })

  it("un error técnico no es esperado y no muestra el texto crudo", () => {
    const interpretado = interpretarErrorLiquidacion(
      { code: "XX000", message: "relation does not exist" },
      "corte"
    )
    expect(interpretado.esperado).toBe(false)
    expect(interpretado.mensaje).not.toMatch(/relation/)
  })
})

describe("textoErrorCorte", () => {
  it("muestra el detalle de la plataforma", () => {
    expect(
      textoErrorCorte("Ya hay una liquidación del medio que cubre ese periodo.")
    ).toBe("Ya hay una liquidación del medio que cubre ese periodo.")
  })

  it("traduce un código suelto y reemplaza lo técnico o vacío", () => {
    expect(textoErrorCorte("AMO_SEG_SOCIAL_PENDIENTE")).toMatch(
      /^Seguridad social pendiente: /
    )
    expect(textoErrorCorte("canceling statement due to lock timeout")).toBe(
      MENSAJE_MEDIO_SIN_LIQUIDAR
    )
    expect(textoErrorCorte("AMO_X algo")).toBe(MENSAJE_MEDIO_SIN_LIQUIDAR)
    expect(textoErrorCorte(null)).toBe(MENSAJE_MEDIO_SIN_LIQUIDAR)
  })
})
