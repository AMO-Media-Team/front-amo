import { describe, expect, it } from "vitest"

import {
  celularParaMostrar,
  MENSAJES_CELULAR,
  normalizarCelularColombia,
} from "./celular"

describe("normalizarCelularColombia", () => {
  it.each([
    ["3001234567", "+57 300 123 4567"],
    ["300 123 4567", "+57 300 123 4567"],
    ["(300) 123-4567", "+57 300 123 4567"],
    ["300.123.4567", "+57 300 123 4567"],
    ["+57 300 123 4567", "+57 300 123 4567"],
    ["+573001234567", "+57 300 123 4567"],
    ["573001234567", "+57 300 123 4567"],
    ["  321 987 6543  ", "+57 321 987 6543"],
  ])("acepta %s", (entrada, esperado) => {
    expect(normalizarCelularColombia(entrada)).toEqual({
      valido: true,
      valor: esperado,
    })
  })

  it("vacío significa sin celular", () => {
    expect(normalizarCelularColombia("   ")).toEqual({
      valido: true,
      valor: null,
    })
  })

  it.each([
    ["6011234567", MENSAJES_CELULAR.formato], // fijo de Bogotá
    ["300123456", MENSAJES_CELULAR.formato], // 9 dígitos
    ["30012345678", MENSAJES_CELULAR.formato], // 11 dígitos
    ["+1 305 123 4567", MENSAJES_CELULAR.extranjero],
    ["300-ABC-4567", MENSAJES_CELULAR.caracteres],
    ["300+1234567", MENSAJES_CELULAR.caracteres],
  ])("rechaza %s", (entrada, mensaje) => {
    expect(normalizarCelularColombia(entrada)).toEqual({
      valido: false,
      mensaje,
    })
  })

  it("el valor guardado cumple el CHECK de perfiles.celular", () => {
    const resultado = normalizarCelularColombia("3001234567")
    expect(resultado.valido && resultado.valor).toMatch(/^\+?[0-9 ]{7,20}$/)
  })
})

describe("celularParaMostrar", () => {
  it("normaliza los guardados con otro formato y respeta los demás", () => {
    expect(celularParaMostrar("3001234567")).toBe("+57 300 123 4567")
    expect(celularParaMostrar("+1 305 123 4567")).toBe("+1 305 123 4567")
    expect(celularParaMostrar(null)).toBe("")
  })
})
