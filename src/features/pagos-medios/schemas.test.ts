import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  esquemaGenerarArchivoPagos,
  esquemaRegistrarPago,
  LIMITES_SOPORTE_PAGO,
  mensajeFechaAnterior,
  MENSAJES_FORMULARIO_PAGO,
  validarFormularioPago,
} from "./schemas"

const ID = "0199f3a0-0000-7000-8000-00000000a501"
const OTRO = "0199f3a0-0000-7000-8000-00000000a502"
/** 23 de octubre de 2026, 10:00 p. m. en Bogotá (ya es 24 en UTC). */
const AHORA = new Date("2026-10-24T03:00:00.000Z")

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("esquemaGenerarArchivoPagos", () => {
  it("exige al menos una, sin repetidas, y repetir es falso por omisión", () => {
    expect(
      esquemaGenerarArchivoPagos.parse({ liquidacionIds: [ID, OTRO] })
    ).toEqual({ liquidacionIds: [ID, OTRO], repetir: false })
    expect(
      esquemaGenerarArchivoPagos.safeParse({ liquidacionIds: [] }).success
    ).toBe(false)
    expect(
      esquemaGenerarArchivoPagos.safeParse({ liquidacionIds: [ID, ID] }).success
    ).toBe(false)
    expect(
      esquemaGenerarArchivoPagos.safeParse({ liquidacionIds: ["no-es-uuid"] })
        .success
    ).toBe(false)
  })

  it("admite hasta 500 por archivo", () => {
    const ids = (cantidad: number) =>
      Array.from(
        { length: cantidad },
        (_, i) => `0199f3a0-0000-7000-8000-${String(i).padStart(12, "0")}`
      )
    expect(
      esquemaGenerarArchivoPagos.safeParse({ liquidacionIds: ids(500) }).success
    ).toBe(true)
    expect(
      esquemaGenerarArchivoPagos.safeParse({ liquidacionIds: ids(501) }).success
    ).toBe(false)
  })
})

describe("esquemaRegistrarPago", () => {
  const valido = {
    liquidacionId: ID,
    fecha: "2026-10-23",
    referencia: "  TRF-20261023-40491 ",
    soportePath: `liquidacion/${ID}/pago/${OTRO}.pdf`,
  }

  it("acepta hoy en Bogotá y recorta la referencia", () => {
    expect(esquemaRegistrarPago.parse(valido)).toEqual({
      ...valido,
      referencia: "TRF-20261023-40491",
    })
  })

  it("rechaza una fecha futura (en Bogotá) o que no existe", () => {
    const futura = esquemaRegistrarPago.safeParse({
      ...valido,
      fecha: "2026-10-24",
    })
    expect(futura.success).toBe(false)
    expect(futura.error?.issues[0]?.message).toBe(
      MENSAJES_FORMULARIO_PAGO.fechaFutura
    )
    expect(
      esquemaRegistrarPago.safeParse({ ...valido, fecha: "2026-02-30" }).success
    ).toBe(false)
  })

  it("exige la referencia (3 a 120 caracteres) y el soporte", () => {
    expect(
      esquemaRegistrarPago.safeParse({ ...valido, referencia: " ab " }).success
    ).toBe(false)
    expect(
      esquemaRegistrarPago.safeParse({ ...valido, referencia: "x".repeat(121) })
        .success
    ).toBe(false)
    expect(
      esquemaRegistrarPago.safeParse({ ...valido, soportePath: "" }).success
    ).toBe(false)
  })
})

describe("validarFormularioPago", () => {
  it("sin errores con todo bien", () => {
    expect(
      validarFormularioPago(
        { fecha: "2026-10-20", referencia: "TRF-1", conSoporte: true },
        "2026-10-17"
      )
    ).toEqual({})
  })

  it("explica cada campo que falta o no cumple", () => {
    expect(
      validarFormularioPago(
        { fecha: "", referencia: "", conSoporte: false },
        "2026-10-17"
      )
    ).toEqual({
      fecha: MENSAJES_FORMULARIO_PAGO.fecha,
      referencia: MENSAJES_FORMULARIO_PAGO.referencia,
      soporte: MENSAJES_FORMULARIO_PAGO.soporte,
    })
  })

  it("no admite una fecha anterior a la mínima de la liquidación", () => {
    expect(
      validarFormularioPago(
        { fecha: "2026-10-16", referencia: "TRF-1", conSoporte: true },
        "2026-10-17"
      )
    ).toEqual({ fecha: mensajeFechaAnterior("2026-10-17") })
    expect(mensajeFechaAnterior("2026-10-17")).toMatch(
      /^La fecha del pago no puede ser anterior al 17 de oct\.? de 2026\.$/
    )
  })
})

describe("LIMITES_SOPORTE_PAGO", () => {
  it("PDF o captura de hasta 10 MB (el bucket no admite WebP ni HEIC)", () => {
    expect(LIMITES_SOPORTE_PAGO.mimes).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
    ])
    expect(LIMITES_SOPORTE_PAGO.maxBytes).toBe(10 * 1024 * 1024)
  })
})
