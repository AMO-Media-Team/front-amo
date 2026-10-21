import { describe, expect, it } from "vitest"

import { enlaceConfirmacion } from "./enlaces"

describe("enlaceConfirmacion", () => {
  it("apunta a /auth/confirm con el token y el tipo", () => {
    expect(enlaceConfirmacion("https://amo.co", "abc123", "invite")).toBe(
      "https://amo.co/auth/confirm?token_hash=abc123&type=invite"
    )
  })

  it("ignora rutas y barras finales del sitio configurado", () => {
    expect(enlaceConfirmacion("http://localhost:3000/", "x", "recovery")).toBe(
      "http://localhost:3000/auth/confirm?token_hash=x&type=recovery"
    )
  })

  it("codifica el token", () => {
    expect(enlaceConfirmacion("https://amo.co", "a b&c", "invite")).toContain(
      "token_hash=a+b%26c"
    )
  })
})
