// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const SECRETO = "c".repeat(48)

const estado = vi.hoisted(() => ({
  secreto: undefined as string | undefined,
  adaptador: null as { nombre: string } | null,
  procesar: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/env.server", () => ({
  getEnvServidor: () => ({ AMO_CORREOS_SECRETO: estado.secreto }),
}))
vi.mock("@/lib/correo", () => ({
  obtenerAdaptadorCorreo: () => estado.adaptador,
}))
vi.mock("@/lib/correo/procesar", async () => {
  class ErrorColaCorreos extends Error {
    constructor(
      readonly operacion: string,
      readonly codigo: string
    ) {
      super("fallo")
    }
  }
  return { ErrorColaCorreos, procesarColaCorreos: estado.procesar }
})

const { POST, maxDuration } = await import("./route")
const { ErrorColaCorreos } = await import("@/lib/correo/procesar")

function pedir(autorizacion?: string) {
  return POST(
    new Request("http://localhost/api/correos/procesar", {
      method: "POST",
      headers: autorizacion ? { Authorization: autorizacion } : {},
      body: "{}",
    })
  )
}

const RESUMEN = {
  reclamados: 2,
  enviados: 2,
  reintentos: 0,
  fallidos: 0,
  ignorados: 0,
  aplazados: 0,
  sinRegistro: 0,
}

describe("POST /api/correos/procesar", () => {
  beforeEach(() => {
    estado.secreto = SECRETO
    estado.adaptador = { nombre: "registro" }
    estado.procesar.mockReset()
    estado.procesar.mockResolvedValue(RESUMEN)
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("se queda dentro de los 60 s de la función", () => {
    expect(maxDuration).toBe(60)
  })

  it("sin secreto configurado la ruta no existe (404)", async () => {
    estado.secreto = undefined
    const respuesta = await pedir(`Bearer ${SECRETO}`)
    expect(respuesta.status).toBe(404)
    expect(estado.procesar).not.toHaveBeenCalled()
  })

  it.each([
    ["sin cabecera", undefined],
    ["con otro secreto", `Bearer ${"x".repeat(48)}`],
  ])("responde 401 %s", async (_caso, cabecera) => {
    const respuesta = await pedir(cabecera)
    expect(respuesta.status).toBe(401)
    expect(respuesta.headers.get("WWW-Authenticate")).toBe("Bearer")
    expect(estado.procesar).not.toHaveBeenCalled()
  })

  it("con el proveedor desactivado responde 204 sin reclamar", async () => {
    estado.adaptador = null
    const respuesta = await pedir(`Bearer ${SECRETO}`)
    expect(respuesta.status).toBe(204)
    expect(estado.procesar).not.toHaveBeenCalled()
  })

  it("procesa y devuelve solo conteos, sin caché", async () => {
    const respuesta = await pedir(`Bearer ${SECRETO}`)
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("Cache-Control")).toBe("no-store")
    expect(await respuesta.json()).toEqual(RESUMEN)
    expect(estado.procesar).toHaveBeenCalledWith({
      adaptador: estado.adaptador,
    })
  })

  it("si la cola falla responde 503 y registra solo el código", async () => {
    estado.procesar.mockRejectedValue(new ErrorColaCorreos("reclamar", "42501"))
    const respuesta = await pedir(`Bearer ${SECRETO}`)
    expect(respuesta.status).toBe(503)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("reclamar:42501")
    )
  })
})
