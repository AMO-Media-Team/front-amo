import { describe, expect, it } from "vitest"

import { iniciales } from "./iniciales"

describe("iniciales", () => {
  it("toma las dos primeras palabras", () => {
    expect(iniciales("Andrés Ramírez Gómez")).toBe("AR")
  })

  it("funciona con una sola palabra, tildes y eñes", () => {
    expect(iniciales("ñusta")).toBe("Ñ")
    expect(iniciales("  Óscar  ")).toBe("Ó")
  })

  it("usa el correo cuando no hay nombre legible", () => {
    expect(iniciales("ana.lopez@amo.co")).toBe("AL")
  })

  it("devuelve un signo si no hay letras", () => {
    expect(iniciales("   ")).toBe("?")
  })
})
