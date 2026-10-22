import { DetailedError, type HttpResponse } from "tus-js-client"
import { describe, expect, it } from "vitest"

import { ErrorSubida } from "@/lib/archivos/reintentos"

import { errorDeTus } from "./transporte-tus"

function respuesta(estado: number, cuerpo: string): HttpResponse {
  return {
    getStatus: () => estado,
    getHeader: () => undefined,
    getBody: () => cuerpo,
    getUnderlyingObject: () => null,
  }
}

/** Como los que entrega tus-js-client a `onError`. */
function detallado(
  respuestaHttp: HttpResponse | null,
  causa: Error | null = null
): DetailedError {
  return Object.assign(new DetailedError("tus: falló"), {
    originalResponse: respuestaHttp,
    causingError: causa,
  })
}

describe("errorDeTus", () => {
  it("usa el estado efectivo de la respuesta", () => {
    const error = errorDeTus(
      detallado(respuesta(400, JSON.stringify({ statusCode: "403" })))
    )
    expect(error).toMatchObject({ estado: 403, reintentable: false })
  })

  it("sin respuesta es un fallo de red reintentable", () => {
    expect(errorDeTus(detallado(null))).toMatchObject({
      estado: null,
      reintentable: true,
    })
    expect(errorDeTus(new Error("x"))).toMatchObject({ estado: null })
  })

  it("conserva el error propio de la sesión vencida", () => {
    const propio = new ErrorSubida(401)
    expect(errorDeTus(propio)).toBe(propio)
    expect(errorDeTus(detallado(null, propio))).toBe(propio)
  })
})
