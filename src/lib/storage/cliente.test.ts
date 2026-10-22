import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { estadoDeError, informarStorage } from "./cliente"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("estadoDeError", () => {
  it("lee el estado HTTP de los errores de storage-js", () => {
    expect(estadoDeError({ status: 404 })).toBe(404)
    expect(estadoDeError({ statusCode: "403" })).toBe(403)
    expect(estadoDeError({ status: 400, statusCode: "404" })).toBe(400)
  })

  it("devuelve null si no hay un estado utilizable", () => {
    for (const error of [null, undefined, "x", new Error("x"), { status: 0 }]) {
      expect(estadoDeError(error), String(error)).toBeNull()
    }
    expect(estadoDeError({ status: "abc" })).toBeNull()
  })
})

describe("informarStorage", () => {
  it("deja la operación y el código, nunca el mensaje (puede llevar rutas)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    informarStorage("info(documentos)", {
      statusCode: "403",
      message: "medio/123/RUT/x.pdf no permitido",
    })
    informarStorage("info(documentos)", "texto suelto")
    expect(log.mock.calls).toEqual([
      ["[storage] info(documentos) falló (403)"],
      ["[storage] info(documentos) falló (desconocido)"],
    ])
  })
})
