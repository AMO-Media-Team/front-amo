import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { MENSAJES_SUBIDA_SERVIDOR, subirComoServicio } from "./subidas-servidor"

const RUTA =
  "documento_soporte/0190a8e4-8c3a-7000-8000-000000000001/0190a8e4-8c3a-7000-8000-000000000002.pdf"

function cliente(error: unknown = null) {
  const upload = vi
    .fn()
    .mockResolvedValue({ data: error ? null : { path: RUTA }, error })
  return {
    upload,
    cliente: { storage: { from: vi.fn(() => ({ upload })) } } as never,
  }
}

describe("subirComoServicio", () => {
  it("sube sin sobrescribir con el MIME indicado", async () => {
    const { cliente: c, upload } = cliente()
    const resultado = await subirComoServicio({
      cliente: c,
      destino: { bucket: "soportes", ruta: RUTA },
      contenido: new Uint8Array([1, 2, 3]),
      tipo: "application/pdf",
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { bucket: "soportes", ruta: RUTA },
    })
    expect(upload).toHaveBeenCalledWith(RUTA, expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    })
  })

  it("convierte el texto en un Blob de su tipo", async () => {
    const { cliente: c, upload } = cliente()
    await subirComoServicio({
      cliente: c,
      destino: { bucket: "soportes", ruta: RUTA.replace(".pdf", ".json") },
      contenido: '{"a":1}',
      tipo: "application/json",
    })
    const cuerpo = upload.mock.calls[0]?.[1] as Blob
    expect(cuerpo).toBeInstanceOf(Blob)
    expect(cuerpo.type).toBe("application/json")
  })

  it("rechaza lo que supera el límite del bucket sin llamar a Storage", async () => {
    const { cliente: c, upload } = cliente()
    const resultado = await subirComoServicio({
      cliente: c,
      destino: { bucket: "soportes", ruta: RUTA },
      contenido: new Uint8Array(10 * 1024 * 1024 + 1),
      tipo: "application/pdf",
    })
    expect(resultado).toMatchObject({
      ok: false,
      error: MENSAJES_SUBIDA_SERVIDOR.muyGrande,
    })
    expect(upload).not.toHaveBeenCalled()
  })

  it("devuelve un fallo legible si Storage rechaza", async () => {
    const { cliente: c } = cliente({ statusCode: "409", message: "exists" })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const resultado = await subirComoServicio({
      cliente: c,
      destino: { bucket: "soportes", ruta: RUTA },
      contenido: new Uint8Array([1]),
      tipo: "application/pdf",
    })
    expect(resultado).toMatchObject({
      ok: false,
      error: MENSAJES_SUBIDA_SERVIDOR.noSubido,
    })
  })

  it("no acepta rutas inseguras", async () => {
    const { cliente: c } = cliente()
    await expect(
      subirComoServicio({
        cliente: c,
        destino: { bucket: "soportes", ruta: "../x.pdf" },
        contenido: new Uint8Array([1]),
        tipo: "application/pdf",
      })
    ).rejects.toThrow(/ruta segura/)
  })
})
