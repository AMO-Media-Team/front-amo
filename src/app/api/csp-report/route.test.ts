// @vitest-environment node
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest"

import { POST } from "./route"

function reporte(cuerpo: string, tipo = "application/csp-report") {
  return new Request("https://amo.test/api/csp-report", {
    method: "POST",
    headers: { "content-type": tipo },
    body: cuerpo,
  })
}

describe("POST /api/csp-report", () => {
  let advertencia: MockInstance<typeof console.warn>

  beforeEach(() => {
    advertencia = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    advertencia.mockRestore()
  })

  it("registra un resumen sin consulta y responde 204", async () => {
    const respuesta = await POST(
      reporte(
        JSON.stringify({
          "csp-report": {
            "document-uri": "https://amo.test/auth/confirm?token_hash=secreto",
            "effective-directive": "script-src-elem",
            "blocked-uri": "https://cdn.example/x.js?user=ana",
          },
        })
      )
    )

    expect(respuesta.status).toBe(204)
    expect(advertencia).toHaveBeenCalledTimes(1)
    const registro = String(advertencia.mock.calls[0][0])
    expect(JSON.parse(registro)).toMatchObject({
      evento: "violacion_csp",
      directiva: "script-src-elem",
      documento: "https://amo.test/auth/confirm",
      recursoBloqueado: "https://cdn.example/x.js",
    })
    expect(registro).not.toContain("secreto")
    expect(registro).not.toContain("ana")
  })

  it("acepta el formato de la API Reporting", async () => {
    const respuesta = await POST(
      reporte(
        JSON.stringify([
          {
            type: "csp-violation",
            body: { effectiveDirective: "img-src", blockedURL: "data" },
          },
        ]),
        "application/reports+json"
      )
    )
    expect(respuesta.status).toBe(204)
    expect(advertencia).toHaveBeenCalledTimes(1)
  })

  it("rechaza tipos de contenido desconocidos", async () => {
    const respuesta = await POST(reporte("{}", "text/plain"))
    expect(respuesta.status).toBe(415)
  })

  it("rechaza cuerpos demasiado grandes sin registrarlos", async () => {
    const respuesta = await POST(reporte(`"${"x".repeat(20 * 1024)}"`))
    expect(respuesta.status).toBe(413)
    expect(advertencia).not.toHaveBeenCalled()
  })

  it("rechaza JSON inválido", async () => {
    const respuesta = await POST(reporte("{no es json"))
    expect(respuesta.status).toBe(400)
  })
})
