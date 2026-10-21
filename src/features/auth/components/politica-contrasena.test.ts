import { describe, expect, it } from "vitest"

import { evaluarContrasena } from "./politica-contrasena"

describe("evaluarContrasena", () => {
  it("una contraseña vacía no cumple nada", () => {
    expect(evaluarContrasena("")).toMatchObject({
      puntaje: 0,
      nivel: "vacia",
      valida: false,
    })
  })

  it("marca cada regla por separado", () => {
    const { cumplidas, puntaje, nivel, valida } = evaluarContrasena("abcDEF")
    expect(cumplidas).toEqual({
      longitud: false,
      mayuscula: true,
      minuscula: true,
      digito: false,
      simbolo: false,
    })
    expect(puntaje).toBe(2)
    expect(nivel).toBe("debil")
    expect(valida).toBe(false)
  })

  it("es aceptable pero no válida si falta una regla", () => {
    expect(evaluarContrasena("Montañas2026x")).toMatchObject({
      nivel: "aceptable",
      valida: false,
    })
  })

  it("valida con las cinco reglas y premia la longitud", () => {
    expect(evaluarContrasena("Montaña#2026")).toMatchObject({
      puntaje: 5,
      nivel: "fuerte",
      valida: true,
    })
    expect(evaluarContrasena("Montaña#2026-Caribe")).toMatchObject({
      nivel: "excelente",
      valida: true,
    })
  })

  it("reconoce letras con tilde y eñe como mayúsculas y minúsculas", () => {
    const { cumplidas } = evaluarContrasena("ÑÁé")
    expect(cumplidas.mayuscula).toBe(true)
    expect(cumplidas.minuscula).toBe(true)
  })

  it("los espacios no cuentan como símbolo", () => {
    expect(evaluarContrasena("Montana 2026x").cumplidas.simbolo).toBe(false)
  })
})
