import { describe, expect, it } from "vitest"

import { evaluarContrasena } from "../../src/features/auth/components/politica-contrasena"
import { agregarVariables } from "./archivo-env"
import { generarContrasena } from "./contrasena"

describe("generarContrasena", () => {
  it("cumple la política de contraseñas de AMO", () => {
    for (let i = 0; i < 200; i++) {
      expect(evaluarContrasena(generarContrasena()).valida).toBe(true)
    }
  })

  it("respeta la longitud pedida y no repite resultados", () => {
    const generadas = new Set(
      Array.from({ length: 50 }, () => generarContrasena(16))
    )
    expect(generadas.size).toBe(50)
    for (const contrasena of generadas) expect(contrasena).toHaveLength(16)
  })

  it("se puede guardar tal cual en .env.local", () => {
    for (let i = 0; i < 200; i++) {
      const contrasena = generarContrasena()
      expect(contrasena).not.toMatch(/[$#"'`\\\s]/)
      expect(() => agregarVariables("", { E2E_X: contrasena })).not.toThrow()
    }
  })

  it("rechaza longitudes menores que la política", () => {
    expect(() => generarContrasena(8)).toThrow()
  })
})
