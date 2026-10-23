import { describe, expect, it } from "vitest"

import { esquemaCancelarOferta, esquemaOferta } from "./schemas"

const ID = "0192f3a4-5b6c-7d8e-9f01-000000000001"

describe("esquemaOferta", () => {
  it("exige un identificador válido", () => {
    expect(esquemaOferta.safeParse({ ofertaId: ID }).success).toBe(true)
    expect(esquemaOferta.safeParse({ ofertaId: "x" }).success).toBe(false)
  })
})

describe("esquemaCancelarOferta", () => {
  it("el motivo es opcional (un borrador no lo pide)", () => {
    expect(esquemaCancelarOferta.parse({ ofertaId: ID })).toEqual({
      ofertaId: ID,
      motivo: null,
    })
    expect(esquemaCancelarOferta.parse({ ofertaId: ID, motivo: "  " })).toEqual(
      { ofertaId: ID, motivo: null }
    )
  })

  it("si llega, se recorta y debe tener sentido", () => {
    expect(
      esquemaCancelarOferta.parse({ ofertaId: ID, motivo: "  Cambió el plan " })
    ).toEqual({ ofertaId: ID, motivo: "Cambió el plan" })
    const corto = esquemaCancelarOferta.safeParse({
      ofertaId: ID,
      motivo: "no",
    })
    expect(corto.success).toBe(false)
    expect(corto.error?.issues[0]?.path).toEqual(["motivo"])
  })

  it("respeta el máximo de caracteres", () => {
    expect(
      esquemaCancelarOferta.safeParse({ ofertaId: ID, motivo: "a".repeat(501) })
        .success
    ).toBe(false)
  })
})
