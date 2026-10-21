import { describe, expect, it } from "vitest"

import { enmascararEmail } from "./enmascarar-email"

describe("enmascararEmail", () => {
  it("deja ver solo el inicio del usuario y el dominio", () => {
    expect(enmascararEmail("andresramirez@gmail.com")).toBe("an•••@gmail.com")
  })

  it("en usuarios cortos muestra una sola letra", () => {
    expect(enmascararEmail("ana@amo.co")).toBe("a•••@amo.co")
    expect(enmascararEmail("a@amo.co")).toBe("a•••@amo.co")
  })

  it("devuelve null si no es un correo", () => {
    expect(enmascararEmail(undefined)).toBeNull()
    expect(enmascararEmail("  ")).toBeNull()
    expect(enmascararEmail("sin-arroba")).toBeNull()
    expect(enmascararEmail("@amo.co")).toBeNull()
    expect(enmascararEmail("ana@")).toBeNull()
  })
})
