import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/url-firmada", () => ({
  vigenciaUrlFirmada: vi.fn(async () => 300),
}))
vi.mock("@/lib/auth/registro", () => ({ registrarEvento: vi.fn() }))

import type { ContextoActor } from "@/lib/auth/contexto-actor"
import { registrarEvento } from "@/lib/auth/registro"

import type { ClienteStorage } from "./cliente"
import {
  firmarDescarga,
  firmarDescargas,
  MENSAJES_DESCARGA,
  nombreDescarga,
} from "./descargas"

const RUTA_1 = "medio/a/RUT/1.pdf"
const RUTA_2 = "medio/a/RUT/2.pdf"

function clienteFirmante() {
  const createSignedUrls = vi.fn(
    async (rutas: string[], _vigencia: number, _opciones?: unknown) => ({
      data: rutas.map((ruta) => ({
        path: ruta,
        signedUrl: `https://x/firmada/${ruta}`,
        error: null,
      })),
      error: null,
    })
  )
  const from = vi.fn(() => ({ createSignedUrls }))
  return {
    cliente: { storage: { from } } as unknown as ClienteStorage,
    from,
    createSignedUrls,
  }
}

beforeEach(() => {
  vi.mocked(registrarEvento).mockResolvedValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("firmar como usuario", () => {
  it("firma con la sesión, sin bitácora, y quita repetidas", async () => {
    const { cliente, from, createSignedUrls } = clienteFirmante()
    const resultado = await firmarDescargas({
      bucket: "documentos",
      rutas: [RUTA_1, RUTA_2, RUTA_1],
      firmante: { como: "usuario", cliente },
    })
    expect(from).toHaveBeenCalledWith("documentos")
    expect(createSignedUrls).toHaveBeenCalledWith(
      [RUTA_1, RUTA_2],
      300,
      undefined
    )
    expect(registrarEvento).not.toHaveBeenCalled()
    expect(resultado).toEqual({
      ok: true,
      datos: {
        urls: {
          [RUTA_1]: `https://x/firmada/${RUTA_1}`,
          [RUTA_2]: `https://x/firmada/${RUTA_2}`,
        },
        vigenciaSegundos: 300,
      },
    })
  })

  it("pide la descarga con un nombre seguro", async () => {
    const { cliente, createSignedUrls } = clienteFirmante()
    await firmarDescarga({
      bucket: "documentos",
      ruta: RUTA_1,
      firmante: { como: "usuario", cliente },
      descarga: "RUT 2026/../final.pdf",
    })
    expect(createSignedUrls).toHaveBeenCalledWith([RUTA_1], 300, {
      download: "RUT 2026.. final.pdf",
    })
  })

  it("una sola ruta devuelve su URL y su vigencia", async () => {
    const { cliente } = clienteFirmante()
    await expect(
      firmarDescarga({
        bucket: "documentos",
        ruta: RUTA_1,
        firmante: { como: "usuario", cliente },
      })
    ).resolves.toEqual({
      ok: true,
      datos: { url: `https://x/firmada/${RUTA_1}`, vigenciaSegundos: 300 },
    })
  })

  it("informa sin acceso si Storage no firma", async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [
        {
          path: RUTA_1,
          signedUrl: null,
          error:
            "Either the object does not exist or you do not have access to it",
        },
      ],
      error: null,
    }))
    const cliente = {
      storage: { from: () => ({ createSignedUrls }) },
    } as unknown as ClienteStorage
    await expect(
      firmarDescarga({
        bucket: "documentos",
        ruta: RUTA_1,
        firmante: { como: "usuario", cliente },
      })
    ).resolves.toEqual({ ok: false, error: MENSAJES_DESCARGA.noEncontrado })
  })
})

describe("firmar como servicio", () => {
  function contextoCon(admin: ClienteStorage): ContextoActor {
    return {
      actorId: "actor",
      sessionId: "sesion",
      admin: admin as unknown as ContextoActor["admin"],
    }
  }

  it("registra URL_FIRMADA antes de firmar con la secret key", async () => {
    const { cliente: admin, createSignedUrls } = clienteFirmante()
    const contexto = contextoCon(admin)
    const resultado = await firmarDescarga({
      bucket: "documentos",
      ruta: RUTA_1,
      firmante: {
        como: "servicio",
        contexto,
        entidad: "documentos_medio",
        entidadId: "doc-1",
      },
    })
    expect(registrarEvento).toHaveBeenCalledWith({
      actorId: "actor",
      admin: contexto.admin,
      accion: "URL_FIRMADA",
      entidad: "documentos_medio",
      entidadId: "doc-1",
      metadatos: { bucket: "documentos", rutas: [RUTA_1], expira_s: 300 },
    })
    expect(vi.mocked(registrarEvento).mock.invocationCallOrder[0]).toBeLessThan(
      createSignedUrls.mock.invocationCallOrder[0]
    )
    expect(resultado.ok).toBe(true)
  })

  it("sin registro en la bitácora no entrega nada", async () => {
    vi.mocked(registrarEvento).mockResolvedValue(false)
    const { cliente: admin, createSignedUrls } = clienteFirmante()
    await expect(
      firmarDescarga({
        bucket: "soportes",
        ruta: "liquidacion/a/1.pdf",
        firmante: {
          como: "servicio",
          contexto: contextoCon(admin),
          entidad: "liquidaciones",
          entidadId: "a",
        },
      })
    ).resolves.toEqual({ ok: false, error: MENSAJES_DESCARGA.sinRegistro })
    expect(createSignedUrls).not.toHaveBeenCalled()
  })
})

describe("nombreDescarga", () => {
  it("quita separadores y caracteres de control", () => {
    expect(nombreDescarga("a/b\\c\u0007d.pdf")).toBe("a b c d.pdf")
    expect(nombreDescarga("   ")).toBe("archivo")
    expect(nombreDescarga("x".repeat(300))).toHaveLength(120)
  })

  it("quita tildes y lo que supabase-js codificaría dos veces", () => {
    expect(nombreDescarga("Cédula de ciudadanía #2 (frente).pdf")).toBe(
      "Cedula de ciudadania 2 frente.pdf"
    )
    expect(nombreDescarga("Año_2026-ñandú.PNG")).toBe("Ano_2026-nandu.PNG")
    expect(nombreDescarga("..oculto.pdf")).toBe("oculto.pdf")
    expect(nombreDescarga("😀")).toBe("archivo")
  })

  it("al recortar conserva la extensión", () => {
    const largo = nombreDescarga(`${"a".repeat(200)}.pdf`)
    expect(largo).toHaveLength(120)
    expect(largo.endsWith(".pdf")).toBe(true)
  })
})
