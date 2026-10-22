import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import type { ClienteStorage } from "./cliente"
import {
  confirmarObjeto,
  MENSAJES_SUBIDA,
  prepararSubidaFirmada,
} from "./subidas"

const A = "0192f5c4-1111-7aaa-8bbb-000000000001"
const U = "0192f5c4-3333-7aaa-8bbb-000000000003"
const RUTA = `asignacion/${A}/publicacion/${U}.webp`
const MINIATURA = `asignacion/${A}/publicacion/${U}-min.webp`

function clienteCon(almacen: Record<string, unknown>) {
  const from = vi.fn(() => almacen)
  return { cliente: { storage: { from } } as unknown as ClienteStorage, from }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("prepararSubidaFirmada", () => {
  it("firma la ruta del servidor en el bucket indicado", async () => {
    const createSignedUploadUrl = vi.fn(async (ruta: string) => ({
      data: { path: ruta, token: `token-${ruta}`, signedUrl: "x" },
      error: null,
    }))
    const { cliente, from } = clienteCon({ createSignedUploadUrl })
    const resultado = await prepararSubidaFirmada({
      cliente,
      bucket: "evidencias",
      ruta: RUTA,
    })
    expect(from).toHaveBeenCalledWith("evidencias")
    expect(resultado).toEqual({
      ok: true,
      datos: {
        bucket: "evidencias",
        ruta: RUTA,
        token: `token-${RUTA}`,
        miniatura: null,
      },
    })
  })

  it("firma también la miniatura si se pide", async () => {
    const createSignedUploadUrl = vi.fn(async (ruta: string) => ({
      data: { path: ruta, token: `token-${ruta}`, signedUrl: "x" },
      error: null,
    }))
    const { cliente } = clienteCon({ createSignedUploadUrl })
    const resultado = await prepararSubidaFirmada({
      cliente,
      bucket: "evidencias",
      ruta: RUTA,
      miniatura: true,
    })
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(2)
    expect(resultado.ok && resultado.datos.miniatura).toEqual({
      ruta: MINIATURA,
      token: `token-${MINIATURA}`,
    })
  })

  it("traduce el rechazo de la política INSERT a un mensaje de permiso", async () => {
    const createSignedUploadUrl = vi.fn(async () => ({
      data: null,
      error: {
        status: 400,
        message: "new row violates row-level security policy",
      },
    }))
    const { cliente } = clienteCon({ createSignedUploadUrl })
    await expect(
      prepararSubidaFirmada({ cliente, bucket: "evidencias", ruta: RUTA })
    ).resolves.toEqual({ ok: false, error: MENSAJES_SUBIDA.sinPermiso })
  })

  it("no firma rutas inseguras y no filtra detalles", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const createSignedUploadUrl = vi.fn()
    const { cliente } = clienteCon({ createSignedUploadUrl })
    await expect(
      prepararSubidaFirmada({
        cliente,
        bucket: "evidencias",
        ruta: "../x.webp",
      })
    ).resolves.toEqual({ ok: false, error: MENSAJES_SUBIDA.noPreparada })
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })
})

describe("confirmarObjeto", () => {
  function conInfo(respuesta: unknown) {
    const info = vi.fn(async () => respuesta)
    return { ...clienteCon({ info }), info }
  }

  it("devuelve lo que Storage sabe del objeto", async () => {
    const { cliente, info } = conInfo({
      data: { size: 2048, contentType: "image/webp" },
      error: null,
    })
    await expect(
      confirmarObjeto({ cliente, bucket: "evidencias", ruta: RUTA })
    ).resolves.toEqual({
      ok: true,
      datos: {
        bucket: "evidencias",
        ruta: RUTA,
        tamano: 2048,
        tipo: "image/webp",
      },
    })
    expect(info).toHaveBeenCalledWith(RUTA)
  })

  it("informa que no terminó de subir si no existe", async () => {
    const { cliente } = conInfo({
      data: null,
      error: { status: 400, message: "Object not found" },
    })
    await expect(
      confirmarObjeto({ cliente, bucket: "evidencias", ruta: RUTA })
    ).resolves.toEqual({ ok: false, error: MENSAJES_SUBIDA.noSubido })
  })

  it("rechaza si el peso o el MIME no son los declarados", async () => {
    const { cliente } = conInfo({
      data: { size: 2048, contentType: "image/webp" },
      error: null,
    })
    await expect(
      confirmarObjeto({
        cliente,
        bucket: "evidencias",
        ruta: RUTA,
        esperado: { tamano: 999 },
      })
    ).resolves.toEqual({ ok: false, error: MENSAJES_SUBIDA.noCoincide })
    await expect(
      confirmarObjeto({
        cliente,
        bucket: "evidencias",
        ruta: RUTA,
        esperado: { tamano: 2048, tipo: "image/png" },
      })
    ).resolves.toEqual({ ok: false, error: MENSAJES_SUBIDA.noCoincide })
  })

  it("no confía en un fallo inesperado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { cliente } = conInfo({ data: null, error: { status: 500 } })
    await expect(
      confirmarObjeto({ cliente, bucket: "evidencias", ruta: RUTA })
    ).resolves.toEqual({ ok: false, error: MENSAJES_SUBIDA.noVerificado })
  })
})
