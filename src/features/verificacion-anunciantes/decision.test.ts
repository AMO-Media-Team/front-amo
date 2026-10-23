import { describe, expect, it } from "vitest"

import { accionesDecision, accionesEstado, situacionDecision } from "./decision"

const OPERACIONES = ["anunciantes.ver", "anunciantes.verificar"]
const ADMIN = [...OPERACIONES, "anunciantes.suspender"]

describe("accionesDecision", () => {
  it("una empresa PENDIENTE se verifica o se rechaza con `anunciantes.verificar`", () => {
    expect(accionesDecision("PENDIENTE", OPERACIONES)).toEqual([
      "verificar",
      "rechazar",
    ])
    expect(accionesDecision("PENDIENTE", ["anunciantes.ver"])).toEqual([])
  })

  it("en los demás estados no hay decisión de verificación", () => {
    for (const estado of ["VERIFICADO", "RECHAZADO", "SUSPENDIDO"] as const) {
      expect(accionesDecision(estado, ADMIN), estado).toEqual([])
    }
  })
})

describe("accionesEstado", () => {
  it("suspender una verificada y reactivar una suspendida exige `anunciantes.suspender`", () => {
    expect(accionesEstado("VERIFICADO", ADMIN)).toEqual(["suspender"])
    expect(accionesEstado("SUSPENDIDO", ADMIN)).toEqual(["reactivar"])
    expect(accionesEstado("VERIFICADO", OPERACIONES)).toEqual([])
    expect(accionesEstado("SUSPENDIDO", OPERACIONES)).toEqual([])
  })

  it("una PENDIENTE o RECHAZADA no se suspende", () => {
    expect(accionesEstado("PENDIENTE", ADMIN)).toEqual([])
    expect(accionesEstado("RECHAZADO", ADMIN)).toEqual([])
  })
})

describe("situacionDecision", () => {
  it("distingue la empresa enviada de la que aún no se envía", () => {
    expect(
      situacionDecision({ estado: "PENDIENTE", enviada: true, motivo: null })
    ).toMatchObject({ tono: "info", titulo: "Espera tu decisión" })
    expect(
      situacionDecision({ estado: "PENDIENTE", enviada: false, motivo: null })
    ).toMatchObject({
      tono: "neutro",
      titulo: "Aún no la envía a verificación",
    })
  })

  it("el rechazo y la suspensión muestran su motivo como frase", () => {
    expect(
      situacionDecision({
        estado: "RECHAZADO",
        enviada: false,
        motivo: "  RUT ilegible ",
      }).descripcion
    ).toBe(
      "Motivo: RUT ilegible. Volverá a la cola cuando la empresa corrija y la envíe de nuevo."
    )
    expect(
      situacionDecision({ estado: "SUSPENDIDO", enviada: false, motivo: null })
        .descripcion
    ).toMatch(/^Mientras siga suspendida/)
  })

  it("una verificada se presenta en éxito", () => {
    expect(
      situacionDecision({ estado: "VERIFICADO", enviada: false, motivo: null })
        .tono
    ).toBe("exito")
  })
})
