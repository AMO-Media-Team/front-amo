import { describe, expect, it } from "vitest"

import { interpretarErrorFacturacion, MENSAJES_FACTURACION } from "./errores"
import { describir, repartirErrores } from "./errores-formulario"

describe("interpretarErrorFacturacion", () => {
  it("cada hint de la fase va a su campo con el detalle de la BD", () => {
    const casos: [string, string][] = [
      ["total_distinto", "total"],
      ["cufe_formato", "cufe"],
      ["cude_formato", "cude"],
      ["archivo_no_cargado", "archivo"],
      ["soporte_no_cargado", "archivo"],
      ["fecha_pago", "fecha"],
      ["monto_invalido", "monto"],
    ]
    for (const [hint, campo] of casos) {
      const error = interpretarErrorFacturacion({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Detalle de la BD.",
        hint,
      })
      expect(error, hint).toMatchObject({
        campo,
        mensaje: "Detalle de la BD.",
        esperado: true,
        accion: null,
      })
    }
  })

  it("sin asignaciones: texto propio en la fecha de corte", () => {
    expect(
      interpretarErrorFacturacion({
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "No hay asignaciones verificadas sin facturar hasta esa fecha.",
        hint: "sin_asignaciones",
      })
    ).toMatchObject({
      campo: "hasta",
      mensaje: MENSAJES_FACTURACION.sinAsignaciones,
      accion: null,
    })
  })

  it("borrador desactualizado: pide anularlo y generar otro", () => {
    expect(
      interpretarErrorFacturacion({
        message: "AMO_TRANSICION_INVALIDA",
        hint: "borrador_desactualizado",
      })
    ).toMatchObject({
      mensaje: MENSAJES_FACTURACION.borradorDesactualizado,
      accion: "anular_borrador",
    })
  })

  it("una transición que ya no aplica pide actualizar la página", () => {
    expect(
      interpretarErrorFacturacion({
        message: "AMO_TRANSICION_INVALIDA",
        details: "La factura no admite pagos en su estado actual.",
      })
    ).toMatchObject({
      mensaje: "La factura no admite pagos en su estado actual.",
      accion: "actualizar",
    })
  })

  it("nota crédito que libera algo no cancelado: a la lista de asignaciones", () => {
    expect(
      interpretarErrorFacturacion({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Solo se liberan las publicaciones canceladas.",
        hint: "solo_canceladas",
      })
    ).toMatchObject({
      campo: "asignacionIds",
      mensaje: MENSAJES_FACTURACION.soloCanceladas,
      esperado: true,
      accion: null,
    })
  })

  it("nota crédito sobre una factura pagada: la devolución va por fuera", () => {
    const error = interpretarErrorFacturacion({
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "La factura ya está pagada.",
      hint: "factura_pagada",
    })
    expect(error).toMatchObject({
      mensaje: MENSAJES_FACTURACION.facturaPagada,
      esperado: true,
      accion: "actualizar",
    })
    expect(error.campo).toBeUndefined()
    expect(error.mensaje).toMatch(/fuera de la plataforma/)
  })

  it("resolución agotada: con su rótulo, en el número", () => {
    expect(
      interpretarErrorFacturacion({
        message: "AMO_RESOLUCION_AGOTADA",
        details:
          "El número no pertenece a una resolución de facturación vigente en la fecha de emisión.",
      })
    ).toMatchObject({
      campo: "consecutivo",
      mensaje:
        "Resolución agotada: el número no pertenece a una resolución de facturación vigente en la fecha de emisión.",
    })
  })

  it("restricciones únicas al campo que corresponde", () => {
    expect(
      interpretarErrorFacturacion({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "notas_credito_cude_key"',
      })
    ).toMatchObject({
      campo: "cude",
      mensaje: "Ese CUDE ya está registrado en otra nota crédito.",
      esperado: true,
    })
  })

  it("lo desconocido no se muestra crudo ni se da por esperado", () => {
    const error = interpretarErrorFacturacion({
      code: "XX000",
      message: "internal error",
    })
    expect(error.esperado).toBe(false)
    expect(error.mensaje).not.toContain("internal")
    expect(error.campo).toBeUndefined()
  })
})

describe("repartirErrores", () => {
  it("campos conocidos a su campo, el archivo a la zona y nada se pierde", () => {
    expect(
      repartirErrores(
        {
          ok: false,
          error: "Revisa los campos marcados.",
          erroresCampo: {
            total: ["No coincide."],
            archivoPath: ["Carga el PDF."],
            facturaId: ["Identificador inválido."],
          },
        },
        ["total", "cufe"] as const
      )
    ).toEqual({
      campos: [["total", "No coincide."]],
      archivo: "Carga el PDF.",
      general: null,
    })
  })

  it("sin campos conocidos ni archivo, el mensaje queda como general", () => {
    expect(
      repartirErrores(
        {
          ok: false,
          error: "La factura no admite pagos en su estado actual.",
          erroresCampo: { otro: ["x"] },
        },
        ["monto"] as const
      )
    ).toEqual({
      campos: [],
      archivo: null,
      general: "La factura no admite pagos en su estado actual.",
    })
  })

  it("describir une ayuda y error y omite los vacíos", () => {
    expect(describir("a-ayuda", false, undefined, "a-error")).toBe(
      "a-ayuda a-error"
    )
    expect(describir(undefined, null)).toBeUndefined()
  })
})
