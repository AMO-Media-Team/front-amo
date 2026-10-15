import { describe, expect, it } from "vitest"

import { claveLimitador } from "./limitador"

describe("claveLimitador", () => {
  it("el ingreso usa el correo normalizado (compatible con las filas existentes)", () => {
    expect(claveLimitador("ingreso", "  Ana@Amo.CO ")).toBe("ana@amo.co")
  })

  it("MFA y recuperación tienen su propio espacio de nombres", () => {
    const id = "0199A7C2-1B2C-7D3E-8F40-123456789ABC"
    expect(claveLimitador("mfa", id)).toBe(
      "mfa:0199a7c2-1b2c-7d3e-8f40-123456789abc"
    )
    expect(claveLimitador("recuperacion", "Ana@Amo.co")).toBe(
      "recuperacion:ana@amo.co"
    )
  })

  it("los fallos de un flujo no comparten clave con los de otro", () => {
    const claves = new Set([
      claveLimitador("ingreso", "ana@amo.co"),
      claveLimitador("mfa", "ana@amo.co"),
      claveLimitador("recuperacion", "ana@amo.co"),
    ])
    expect(claves.size).toBe(3)
  })
})
