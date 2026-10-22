import { describe, expect, it } from "vitest"

import {
  esquemaAprobarCuenta,
  esquemaAprobarDocumento,
  esquemaCambiarNivel,
  esquemaComprobarCodigo,
  esquemaPertinencia,
  esquemaRechazarMedio,
  esquemaVerificarMedio,
  esquemaVideollamada,
} from "./schemas"

const ID = "01a161ee-63b8-7919-8777-67bba5c8ba10"

describe("esquemaAprobarDocumento", () => {
  it("vigencia y observaciones son opcionales y vacías valen null", () => {
    expect(
      esquemaAprobarDocumento.parse({
        documentoId: ID,
        fechaVencimiento: "",
        observaciones: "  ",
      })
    ).toEqual({ documentoId: ID, fechaVencimiento: null, observaciones: null })
    expect(esquemaAprobarDocumento.parse({ documentoId: ID })).toEqual({
      documentoId: ID,
      fechaVencimiento: null,
      observaciones: null,
    })
  })

  it("rechaza una fecha que no existe", () => {
    const resultado = esquemaAprobarDocumento.safeParse({
      documentoId: ID,
      fechaVencimiento: "2027-02-30",
    })
    expect(resultado.success).toBe(false)
  })

  it("acepta una fecha real y recorta las observaciones", () => {
    expect(
      esquemaAprobarDocumento.parse({
        documentoId: ID,
        fechaVencimiento: "2027-02-28",
        observaciones: " Legible ",
      })
    ).toEqual({
      documentoId: ID,
      fechaVencimiento: "2027-02-28",
      observaciones: "Legible",
    })
  })
})

describe("esquemaAprobarCuenta", () => {
  it("exige un entero no negativo", () => {
    expect(
      esquemaAprobarCuenta.safeParse({
        verificacionId: ID,
        seguidoresVerificados: 58_000,
      }).success
    ).toBe(true)
    expect(
      esquemaAprobarCuenta.safeParse({
        verificacionId: ID,
        seguidoresVerificados: 1.5,
      }).success
    ).toBe(false)
    expect(
      esquemaAprobarCuenta.safeParse({
        verificacionId: ID,
        seguidoresVerificados: -1,
      }).success
    ).toBe(false)
  })
})

describe("decisión sobre el medio", () => {
  it("nivel entre 1 y 3", () => {
    expect(esquemaVerificarMedio.safeParse({ medioId: ID, nivel: 2 }).success).toBe(
      true
    )
    expect(esquemaVerificarMedio.safeParse({ medioId: ID, nivel: 0 }).success).toBe(
      false
    )
    expect(esquemaVerificarMedio.safeParse({ medioId: ID, nivel: 4 }).success).toBe(
      false
    )
  })

  it("cambiar de nivel y rechazar exigen motivo (≤ 500, como motivo_estado)", () => {
    expect(
      esquemaCambiarNivel.safeParse({ medioId: ID, nivel: 2, motivo: "ok" })
        .success
    ).toBe(false)
    expect(
      esquemaRechazarMedio.safeParse({
        medioId: ID,
        motivo: "x".repeat(501),
      }).success
    ).toBe(false)
    expect(
      esquemaRechazarMedio.parse({
        medioId: ID,
        motivo: "  La cédula no es legible.  ",
      }).motivo
    ).toBe("La cédula no es legible.")
  })
})

describe("esquemaVideollamada", () => {
  it("exige una descripción suficiente", () => {
    expect(
      esquemaVideollamada.safeParse({ medioId: ID, observaciones: "ok" })
        .success
    ).toBe(false)
    expect(
      esquemaVideollamada.safeParse({
        medioId: ID,
        observaciones:
          "Videollamada del 22/10 con Ana; exhibió la cédula original.",
      }).success
    ).toBe(true)
  })
})

describe("esquemaComprobarCodigo", () => {
  it("largo razonable", () => {
    expect(
      esquemaComprobarCodigo.safeParse({ verificacionId: ID, codigo: "AB" })
        .success
    ).toBe(false)
    expect(
      esquemaComprobarCodigo.safeParse({ verificacionId: ID, codigo: "AB3-K9P" })
        .success
    ).toBe(true)
  })
})

describe("esquemaPertinencia", () => {
  it("multiplicador en rango y redondeado a tres decimales", () => {
    expect(
      esquemaPertinencia.parse({
        medioId: ID,
        municipioCodigo: "05266",
        multiplicador: 1.15004,
        notas: "",
      })
    ).toEqual({
      medioId: ID,
      municipioCodigo: "05266",
      multiplicador: 1.15,
      notas: null,
    })
    for (const multiplicador of [0.49, 1.51, Number.NaN]) {
      expect(
        esquemaPertinencia.safeParse({
          medioId: ID,
          municipioCodigo: "05266",
          multiplicador,
        }).success
      ).toBe(false)
    }
  })

  it("municipio de cinco cifras y notas de hasta 500", () => {
    expect(
      esquemaPertinencia.safeParse({
        medioId: ID,
        municipioCodigo: "5266",
        multiplicador: 1,
      }).success
    ).toBe(false)
    expect(
      esquemaPertinencia.safeParse({
        medioId: ID,
        municipioCodigo: "05266",
        multiplicador: 1,
        notas: "x".repeat(501),
      }).success
    ).toBe(false)
  })
})
