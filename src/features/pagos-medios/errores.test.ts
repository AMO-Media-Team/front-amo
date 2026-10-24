import { describe, expect, it } from "vitest"

import {
  cambioDeEstado,
  HINTS_PAGOS,
  interpretarErrorPagos,
  mensajeDatosIlegibles,
  MENSAJES_PAGOS,
} from "./errores"

describe("interpretarErrorPagos", () => {
  it("sin «Ver datos sensibles» lo dice con el texto del brief", () => {
    expect(
      interpretarErrorPagos({
        message: "AMO_NO_AUTORIZADO",
        details: "El archivo de pagos exige también el permiso…",
        hint: HINTS_PAGOS.datosSensibles,
      })
    ).toEqual({
      mensaje: MENSAJES_PAGOS.sinDatosSensibles,
      hint: "datos_sensibles.ver",
      esperado: true,
    })
    expect(MENSAJES_PAGOS.sinDatosSensibles).toMatch(
      /^Necesitas el permiso Ver datos sensibles: el archivo revela los datos bancarios/
    )
  })

  it("la fecha del pago va al campo de la fecha con el detalle de la BD", () => {
    expect(
      interpretarErrorPagos({
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "La fecha del pago va entre la generación de la liquidación y hoy.",
        hint: "fecha_pago",
      })
    ).toEqual({
      mensaje:
        "La fecha del pago va entre la generación de la liquidación y hoy.",
      campo: "fecha",
      hint: "fecha_pago",
      esperado: true,
    })
  })

  it("el soporte que no está va al campo del soporte", () => {
    expect(
      interpretarErrorPagos({
        message: "AMO_TRANSICION_INVALIDA",
        details: "El soporte del pago no está cargado: súbelo de nuevo.",
        hint: "soporte_no_cargado",
      })
    ).toMatchObject({
      campo: "soporte",
      mensaje: MENSAJES_PAGOS.soporteNoCargado,
    })
  })

  it("sin documento soporte el mensaje empieza con «Documento soporte requerido»", () => {
    expect(
      interpretarErrorPagos({
        message: "AMO_DOCUMENTO_SOPORTE_REQUERIDO",
        details: "Falta el documento soporte o la factura de: Radio Pasto.",
        hint: "documento_soporte_requerido",
      }).mensaje
    ).toBe(
      "Documento soporte requerido: falta el documento soporte o la factura de: Radio Pasto."
    )
  })

  it("los datos de pago incompletos nombran los medios (detalle de la BD)", () => {
    const { mensaje, esperado, campo } = interpretarErrorPagos({
      message: "AMO_TRANSICION_INVALIDA",
      details:
        "Estos medios no tienen datos de pago completos con su certificación aprobada: Radio Pasto.",
      hint: "datos_pago_incompletos",
    })
    expect(mensaje).toContain("Radio Pasto")
    expect(esperado).toBe(true)
    expect(campo).toBeUndefined()
  })

  it("una que dejó de estar aprobada se explica en voz de Finanzas", () => {
    expect(
      interpretarErrorPagos({
        message: "AMO_TRANSICION_INVALIDA",
        details: "Todas las liquidaciones deben estar aprobadas.",
        hint: "no_aprobada",
      }).mensaje
    ).toBe(MENSAJES_PAGOS.noAprobada)
  })

  it("un error sin código no se da por esperado", () => {
    expect(
      interpretarErrorPagos({ code: "XX000", message: "boom" })
    ).toMatchObject({ esperado: false, hint: null })
  })
})

describe("cambioDeEstado", () => {
  it("reconoce lo que obliga a refrescar la lista", () => {
    expect(cambioDeEstado({ hint: "no_aprobada" })).toBe(true)
    expect(cambioDeEstado({ hint: "ya_dispersada" })).toBe(true)
    expect(cambioDeEstado({ message: "AMO_TRANSICION_INVALIDA" })).toBe(true)
    expect(cambioDeEstado({ message: "AMO_NO_AUTORIZADO" })).toBe(false)
  })
})

describe("mensajeDatosIlegibles", () => {
  it("nombra uno, varios o los primeros cinco y cuántos más", () => {
    expect(mensajeDatosIlegibles(["Radio Pasto"])).toBe(
      "No pudimos leer los datos de pago de Radio Pasto. Pide que los vuelvan a guardar en Mi medio › Pago; mientras tanto, genera el archivo sin ese medio."
    )
    expect(mensajeDatosIlegibles(["A", "B"])).toContain("de A y B.")
    expect(
      mensajeDatosIlegibles(["A", "B", "C", "D", "E", "F", "G"])
    ).toContain("de A, B, C, D, E y 2 más.")
  })
})
