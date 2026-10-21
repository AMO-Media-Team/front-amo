import { afterEach, describe, expect, it, vi } from "vitest"

import {
  construirRegistroError,
  onRequestError,
  rutaSinConsulta,
} from "./instrumentation"

type Contexto = Parameters<typeof onRequestError>[2]

const SOLICITUD = {
  path: "/auth/confirm?token_hash=secreto&email=ana%40correo.co",
  method: "GET",
  headers: { cookie: "sb-access-token=abc", "x-forwarded-for": "1.2.3.4" },
}

const CONTEXTO: Contexto = {
  routerKind: "App Router",
  routePath: "/auth/confirm",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
}

describe("rutaSinConsulta", () => {
  it.each([
    ["/a/b?x=1", "/a/b"],
    ["/a#seccion", "/a"],
    ["/a", "/a"],
  ])("%s → %s", (entrada, esperado) => {
    expect(rutaSinConsulta(entrada)).toBe(esperado)
  })
})

describe("construirRegistroError", () => {
  it("registra ruta, método, digest y tipo de ruta", () => {
    const error = Object.assign(new TypeError("fallo con ana@correo.co"), {
      digest: "12345",
    })
    expect(construirRegistroError(error, SOLICITUD, CONTEXTO)).toEqual({
      nivel: "error",
      evento: "error_solicitud",
      ruta: "/auth/confirm",
      metodo: "GET",
      digest: "12345",
      tipoError: "TypeError",
      routeType: "render",
      routePath: "/auth/confirm",
      renderSource: "react-server-components",
    })
  })

  it("no filtra PII (mensaje, query, cabeceras)", () => {
    const registro = JSON.stringify(
      construirRegistroError(
        new Error("fallo con ana@correo.co"),
        SOLICITUD,
        CONTEXTO
      )
    )
    for (const sensible of ["ana", "secreto", "abc", "1.2.3.4"]) {
      expect(registro).not.toContain(sensible)
    }
  })

  it("tolera valores lanzados que no son Error", () => {
    const registro = construirRegistroError("texto", SOLICITUD, CONTEXTO)
    expect(registro.tipoError).toBe("string")
    expect(registro.digest).toBeUndefined()
  })
})

describe("onRequestError", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("escribe una sola línea JSON en console.error", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => {})
    await onRequestError(new Error("x"), SOLICITUD, CONTEXTO)
    expect(espia).toHaveBeenCalledOnce()
    const [linea] = espia.mock.calls[0]
    expect(JSON.parse(String(linea))).toMatchObject({
      evento: "error_solicitud",
      ruta: "/auth/confirm",
    })
  })
})
