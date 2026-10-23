import { describe, expect, it } from "vitest"

import { correoDeConfiguracion, textoContacto } from "./contacto"

describe("canal de contacto (D74)", () => {
  it("solo un correo con valor cuenta como canal", () => {
    expect(correoDeConfiguracion(" soporte@amo.co ")).toBe("soporte@amo.co")
    expect(correoDeConfiguracion("")).toBeNull()
    expect(correoDeConfiguracion("   ")).toBeNull()
    expect(correoDeConfiguracion("escríbenos")).toBeNull()
    expect(correoDeConfiguracion(null)).toBeNull()
    expect(correoDeConfiguracion(undefined)).toBeNull()
    expect(correoDeConfiguracion({ correo: "soporte@amo.co" })).toBeNull()
  })

  it("sin correo no se le pide a nadie que escriba", () => {
    expect(textoContacto("soporte@amo.co")).toBe(
      "Si tienes dudas, escríbenos a soporte@amo.co."
    )
    expect(textoContacto("soporte@amo.co", "Si no estás de acuerdo")).toBe(
      "Si no estás de acuerdo, escríbenos a soporte@amo.co."
    )
    expect(textoContacto(null)).toBe("")
  })
})
