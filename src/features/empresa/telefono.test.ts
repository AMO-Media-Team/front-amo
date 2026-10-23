import { describe, expect, it } from "vitest"

import {
  celularContactoParaMostrar,
  MENSAJES_CELULAR_CONTACTO,
  normalizarCelularContacto,
} from "./telefono"

describe("normalizarCelularContacto", () => {
  it("vacío es sin celular", () => {
    expect(normalizarCelularContacto("  ")).toEqual({
      valido: true,
      valor: null,
    })
  })

  it("un celular colombiano queda como +57 300 123 4567", () => {
    for (const escrito of [
      "3001234567",
      "300 123 4567",
      "+57 300 123 4567",
      "573001234567",
    ]) {
      expect(normalizarCelularContacto(escrito)).toEqual({
        valido: true,
        valor: "+57 300 123 4567",
      })
    }
  })

  it("uno de otro país se guarda con su indicativo (E.164)", () => {
    expect(normalizarCelularContacto("+1 (305) 555-0100")).toEqual({
      valido: true,
      valor: "+13055550100",
    })
    expect(normalizarCelularContacto("+52 55 1234 5678")).toEqual({
      valido: true,
      valor: "+525512345678",
    })
  })

  it("explica qué corregir", () => {
    expect(normalizarCelularContacto("+1 305")).toEqual({
      valido: false,
      mensaje: MENSAJES_CELULAR_CONTACTO.internacional,
    })
    expect(normalizarCelularContacto("1234567")).toEqual({
      valido: false,
      mensaje: MENSAJES_CELULAR_CONTACTO.formato,
    })
    expect(normalizarCelularContacto("+57 123")).toEqual({
      valido: false,
      mensaje: MENSAJES_CELULAR_CONTACTO.formato,
    })
    expect(normalizarCelularContacto("300-ABC")).toEqual({
      valido: false,
      mensaje: MENSAJES_CELULAR_CONTACTO.caracteres,
    })
  })

  it("para mostrar normaliza lo guardado y deja tal cual lo que no reconoce", () => {
    expect(celularContactoParaMostrar(null)).toBe("")
    expect(celularContactoParaMostrar("3001234567")).toBe("+57 300 123 4567")
    expect(celularContactoParaMostrar("601 555 1234")).toBe("601 555 1234")
  })
})
