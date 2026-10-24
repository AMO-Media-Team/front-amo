import { describe, expect, it } from "vitest"

import { esquemaMedio, esquemaMotivoMedio } from "./schemas"

const MEDIO = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"

describe("esquemaMotivoMedio", () => {
  it("recorta el motivo y lo acepta con al menos 5 caracteres", () => {
    expect(
      esquemaMotivoMedio.parse({
        medioId: MEDIO,
        motivo: "  Fraude en métricas ",
      })
    ).toEqual({ medioId: MEDIO, motivo: "Fraude en métricas" })
  })

  it("exige motivo, con el mensaje en el campo", () => {
    const resultado = esquemaMotivoMedio.safeParse({
      medioId: MEDIO,
      motivo: " no ",
    })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]).toMatchObject({
      path: ["motivo"],
      message: "Describe el motivo (al menos 5 caracteres).",
    })
  })

  it("no admite más de lo que guarda `medios.motivo_estado`", () => {
    expect(
      esquemaMotivoMedio.safeParse({ medioId: MEDIO, motivo: "a".repeat(501) })
        .success
    ).toBe(false)
    expect(
      esquemaMotivoMedio.safeParse({ medioId: MEDIO, motivo: "a".repeat(500) })
        .success
    ).toBe(true)
  })

  it("rechaza un identificador que no es UUID", () => {
    expect(
      esquemaMotivoMedio.safeParse({ medioId: "1", motivo: "Motivo válido" })
        .success
    ).toBe(false)
    expect(esquemaMedio.safeParse({ medioId: MEDIO }).success).toBe(true)
    expect(esquemaMedio.safeParse({ medioId: "x" }).success).toBe(false)
  })
})
