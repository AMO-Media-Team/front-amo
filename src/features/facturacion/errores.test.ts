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
