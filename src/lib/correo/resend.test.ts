import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const {
  crearAdaptadorResend,
  interpretarRespuestaResend,
  TIEMPO_MAXIMO_ENVIO_MS,
  URL_API_RESEND,
} = await import("./resend")

const MENSAJE = {
  para: "medio@ejemplo.co",
  asunto: "Nueva oferta disponible",
  html: "<p>Hola</p>",
  texto: "Hola",
  claveIdempotencia: "amo-correo-41",
}

function respuesta(estado: number, cuerpo?: unknown): Response {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" },
  })
}

describe("interpretarRespuestaResend", () => {
  it("2xx → enviado con el id del proveedor", async () => {
    expect(
      await interpretarRespuestaResend(respuesta(200, { id: "re_123" }))
    ).toEqual({ estado: "enviado", proveedorId: "re_123" })
    expect(await interpretarRespuestaResend(respuesta(202, {}))).toEqual({
      estado: "enviado",
      proveedorId: null,
    })
  })

  it("429 → reintentar y pausar la corrida", async () => {
    expect(
      await interpretarRespuestaResend(
        respuesta(429, { name: "rate_limit_exceeded", message: "Too many" })
      )
    ).toEqual({
      estado: "reintentar",
      error: "resend_429_rate_limit_exceeded",
      pausar: true,
    })
  })

  it.each([500, 502, 503])("%i → reintentar", async (estado) => {
    expect(await interpretarRespuestaResend(respuesta(estado))).toEqual({
      estado: "reintentar",
      error: `resend_${estado}`,
    })
  })

  it("409 por una petición idéntica en curso → reintentar", async () => {
    expect(
      await interpretarRespuestaResend(
        respuesta(409, { name: "concurrent_idempotent_requests" })
      )
    ).toMatchObject({ estado: "reintentar" })
  })

  it.each([400, 401, 403, 409, 422])("%i → fallido", async (estado) => {
    expect(
      await interpretarRespuestaResend(
        respuesta(estado, { name: "validation_error" })
      )
    ).toEqual({
      estado: "fallido",
      error: `resend_${estado}_validation_error`,
    })
  })

  it("no guarda el texto del proveedor (puede citar la dirección)", async () => {
    const resultado = await interpretarRespuestaResend(
      respuesta(422, {
        name: "Invalid `to` field: medio@ejemplo.co",
        message: "Invalid `to` field: medio@ejemplo.co",
      })
    )
    expect(resultado).toEqual({ estado: "fallido", error: "resend_422" })
    expect(JSON.stringify(resultado)).not.toContain("@")
  })
})

describe("crearAdaptadorResend", () => {
  it("envía con la clave de idempotencia, el remitente y un tiempo máximo", async () => {
    const hacerFetch = vi.fn<typeof fetch>(async () =>
      respuesta(200, { id: "re_9" })
    )
    const adaptador = crearAdaptadorResend({
      apiKey: "re_clave",
      remitente: "AMO <avisos@amo.co>",
      hacerFetch,
    })

    expect(await adaptador.enviar(MENSAJE)).toEqual({
      estado: "enviado",
      proveedorId: "re_9",
    })
    const [url, opciones] = hacerFetch.mock.calls[0]
    expect(url).toBe(URL_API_RESEND)
    expect(opciones?.method).toBe("POST")
    expect(opciones?.headers).toMatchObject({
      Authorization: "Bearer re_clave",
      "Idempotency-Key": "amo-correo-41",
    })
    expect(opciones?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(opciones?.body))).toEqual({
      from: "AMO <avisos@amo.co>",
      to: ["medio@ejemplo.co"],
      subject: "Nueva oferta disponible",
      html: "<p>Hola</p>",
      text: "Hola",
    })
    expect(TIEMPO_MAXIMO_ENVIO_MS).toBe(10_000)
  })

  it("un fallo de red o un tiempo agotado se reintenta", async () => {
    const red = crearAdaptadorResend({
      apiKey: "re_clave",
      remitente: "avisos@amo.co",
      hacerFetch: async () => {
        throw new TypeError("fetch failed")
      },
    })
    expect(await red.enviar(MENSAJE)).toEqual({
      estado: "reintentar",
      error: "red",
    })

    const lento = crearAdaptadorResend({
      apiKey: "re_clave",
      remitente: "avisos@amo.co",
      hacerFetch: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError")
      },
    })
    expect(await lento.enviar(MENSAJE)).toEqual({
      estado: "reintentar",
      error: "tiempo_agotado",
    })
  })
})
