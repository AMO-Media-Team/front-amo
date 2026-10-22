import { describe, expect, it } from "vitest"

import {
  ErrorSubida,
  errorCancelada,
  esCancelacion,
  esperaReintento,
  esReintentable,
  estadoEfectivo,
  mensajeFalloSubida,
  POLITICA_REINTENTOS,
} from "./reintentos"

describe("esperaReintento", () => {
  it("crece exponencialmente con variación entre la mitad y el total", () => {
    expect(esperaReintento(1, POLITICA_REINTENTOS, () => 1)).toBe(1_000)
    expect(esperaReintento(1, POLITICA_REINTENTOS, () => 0)).toBe(500)
    expect(esperaReintento(3, POLITICA_REINTENTOS, () => 1)).toBe(4_000)
  })

  it("no supera el tope", () => {
    expect(esperaReintento(20, POLITICA_REINTENTOS, () => 1)).toBe(30_000)
  })
})

describe("esReintentable", () => {
  it("repite fallos de red, transitorios y del servidor", () => {
    for (const estado of [null, 0, 408, 429, 500, 502, 503]) {
      expect(esReintentable(estado), String(estado)).toBe(true)
    }
  })

  it("no insiste con permisos, formato ni peso", () => {
    for (const estado of [400, 401, 403, 404, 413, 415]) {
      expect(esReintentable(estado), String(estado)).toBe(false)
    }
  })
})

describe("mensajes", () => {
  it("explica cada fallo en español", () => {
    expect(mensajeFalloSubida(null)).toMatch(/conexión/)
    expect(mensajeFalloSubida(413)).toMatch(/tamaño/)
    expect(mensajeFalloSubida(503)).toMatch(/no respondió/)
    expect(mensajeFalloSubida(418)).toBe(
      "No se pudo subir el archivo. Inténtalo de nuevo."
    )
  })

  it("ErrorSubida lleva el estado y si se puede repetir", () => {
    const error = new ErrorSubida(403)
    expect(error.estado).toBe(403)
    expect(error.reintentable).toBe(false)
    expect(error.message).toBe(mensajeFalloSubida(403))
    expect(new ErrorSubida(null, "Propio").message).toBe("Propio")
  })

  it("reconoce la cancelación estándar", () => {
    expect(esCancelacion(errorCancelada())).toBe(true)
    expect(esCancelacion(new Error("x"))).toBe(false)
  })
})

describe("estadoEfectivo", () => {
  it("prefiere el statusCode del cuerpo de Storage", () => {
    expect(
      estadoEfectivo(
        400,
        JSON.stringify({ statusCode: "403", error: "Unauthorized" })
      )
    ).toBe(403)
    expect(estadoEfectivo(400, JSON.stringify({ statusCode: "409" }))).toBe(409)
  })

  it("se queda con el estado HTTP si el cuerpo no sirve", () => {
    expect(estadoEfectivo(502, "<html>Bad gateway</html>")).toBe(502)
    expect(estadoEfectivo(400, JSON.stringify({ statusCode: "abc" }))).toBe(400)
    expect(estadoEfectivo(500, null)).toBe(500)
  })
})
