import { describe, expect, it } from "vitest"

import {
  esquemaCambioContrasena,
  esquemaConfirmarFactor,
  esquemaPerfil,
} from "./schemas"

describe("esquemaPerfil", () => {
  it("normaliza nombre y celular", () => {
    expect(
      esquemaPerfil.parse({ nombre: "  Ana Pérez ", celular: "300 123 4567" })
    ).toEqual({ nombre: "Ana Pérez", celular: "+57 300 123 4567" })
  })

  it("el celular es opcional", () => {
    expect(esquemaPerfil.parse({ nombre: "Ana", celular: "" }).celular).toBe(
      null
    )
  })

  it("explica por qué rechaza un celular", () => {
    const resultado = esquemaPerfil.safeParse({
      nombre: "Ana",
      celular: "6011234567",
    })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.path).toEqual(["celular"])
  })
})

describe("esquemaCambioContrasena", () => {
  const valida = "Nueva-Clave-2026!"

  it("acepta un cambio correcto", () => {
    expect(
      esquemaCambioContrasena.safeParse({
        actual: "anterior",
        nueva: valida,
        confirmacion: valida,
        cerrarOtras: true,
      }).success
    ).toBe(true)
  })

  it("exige la política, la confirmación y una contraseña distinta", () => {
    const rutas = (datos: Record<string, unknown>) =>
      esquemaCambioContrasena
        .safeParse({ cerrarOtras: false, ...datos })
        .error?.issues.map((issue) => issue.path.join("."))

    expect(
      rutas({ actual: "x", nueva: "corta", confirmacion: "corta" })
    ).toContain("nueva")
    expect(
      rutas({ actual: "x", nueva: valida, confirmacion: "otra" })
    ).toContain("confirmacion")
    expect(
      rutas({ actual: valida, nueva: valida, confirmacion: valida })
    ).toContain("nueva")
    expect(
      rutas({ actual: "", nueva: valida, confirmacion: valida })
    ).toContain("actual")
  })
})

describe("esquemaConfirmarFactor", () => {
  it("exige 6 dígitos y un factor válido", () => {
    expect(
      esquemaConfirmarFactor.safeParse({
        factorId: "0192a0b0-3333-4000-8000-000000000003",
        codigo: " 123456 ",
      }).success
    ).toBe(true)
    expect(
      esquemaConfirmarFactor.safeParse({ factorId: "x", codigo: "12345" })
        .success
    ).toBe(false)
  })
})
