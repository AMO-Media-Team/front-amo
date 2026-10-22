import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ErrorSubida } from "@/lib/archivos/reintentos"

import {
  MENSAJE_ESTANCADA,
  type OpcionesSubidaFirmada,
  subirConUrlFirmada,
} from "./transporte-firmado"

/** XMLHttpRequest mínimo controlado por la prueba. */
class XhrFalso {
  static ultima: XhrFalso | null = null
  metodo = ""
  url = ""
  cabeceras: Record<string, string> = {}
  cuerpo: FormData | null = null
  status = 0
  responseText = ""
  upload: { onprogress: ((evento: ProgressEvent) => void) | null } = {
    onprogress: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() {
    XhrFalso.ultima = this
  }
  open(metodo: string, url: string) {
    this.metodo = metodo
    this.url = url
  }
  setRequestHeader(nombre: string, valor: string) {
    this.cabeceras[nombre] = valor
  }
  send(cuerpo: FormData) {
    this.cuerpo = cuerpo
  }
  abort() {
    this.onabort?.()
  }
  progreso(loaded: number, total: number) {
    this.upload.onprogress?.({
      loaded,
      total,
      lengthComputable: true,
    } as ProgressEvent)
  }
  responder(status: number, cuerpo = "") {
    this.status = status
    this.responseText = cuerpo
    this.onload?.()
  }
}

const archivo = new File(["0123456789"], "captura.webp", { type: "image/webp" })

function opciones(
  cambios: Partial<OpcionesSubidaFirmada> = {}
): OpcionesSubidaFirmada {
  return {
    url: "https://x.supabase.co/storage/v1/object/upload/sign/b/r.webp?token=t",
    archivo,
    clavePublica: "sb_publishable_x",
    senal: new AbortController().signal,
    alProgresar: vi.fn(),
    ...cambios,
  }
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", XhrFalso)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("subirConUrlFirmada", () => {
  it("hace el PUT multipart de supabase-js e informa el progreso", async () => {
    const alProgresar = vi.fn()
    const promesa = subirConUrlFirmada(opciones({ alProgresar }))
    const xhr = XhrFalso.ultima!
    expect(xhr.metodo).toBe("PUT")
    expect(xhr.cabeceras).toEqual({
      apikey: "sb_publishable_x",
      "x-upsert": "false",
    })
    expect(xhr.cuerpo?.get("cacheControl")).toBe("3600")
    expect(xhr.cuerpo?.get("")).toBeInstanceOf(File)

    xhr.progreso(5, 10)
    xhr.responder(200, "{}")
    await expect(promesa).resolves.toBeUndefined()
    expect(alProgresar).toHaveBeenCalledWith(5, 10)
    expect(alProgresar).toHaveBeenLastCalledWith(10, 10)
  })

  it("da por buena una subida que ya existía (409 de un intento anterior)", async () => {
    const promesa = subirConUrlFirmada(opciones())
    XhrFalso.ultima!.responder(
      400,
      JSON.stringify({ statusCode: "409", error: "Duplicate" })
    )
    await expect(promesa).resolves.toBeUndefined()
  })

  it("rechaza con el estado efectivo de Storage", async () => {
    const promesa = subirConUrlFirmada(opciones())
    XhrFalso.ultima!.responder(
      400,
      JSON.stringify({ statusCode: "403", error: "Unauthorized" })
    )
    const error = await promesa.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ErrorSubida)
    expect(error).toMatchObject({ estado: 403, reintentable: false })
  })

  it("un fallo de red es reintentable", async () => {
    const promesa = subirConUrlFirmada(opciones())
    XhrFalso.ultima!.onerror?.()
    await expect(promesa).rejects.toMatchObject({
      estado: null,
      reintentable: true,
    })
  })

  it("cancela con AbortError", async () => {
    const controlador = new AbortController()
    const promesa = subirConUrlFirmada(opciones({ senal: controlador.signal }))
    controlador.abort()
    await expect(promesa).rejects.toMatchObject({ name: "AbortError" })
  })

  it("corta una subida sin avance y la deja para reintentar", async () => {
    vi.useFakeTimers()
    const promesa = subirConUrlFirmada(opciones({ inactividadMs: 1_000 }))
    XhrFalso.ultima!.progreso(1, 10)
    vi.advanceTimersByTime(999)
    XhrFalso.ultima!.progreso(2, 10)
    vi.advanceTimersByTime(1_000)
    await expect(promesa).rejects.toMatchObject({
      message: MENSAJE_ESTANCADA,
      reintentable: true,
    })
  })
})
