import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OpcionesSubida, ResultadoSubida } from "./motor-subida"
import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { exito } from "@/lib/result"

/** `useSubida` falso: guarda las opciones y deja que la prueba decida cada subida. */
const subida = vi.hoisted(() => ({
  opciones: null as OpcionesSubida<unknown> | null,
  subir: vi.fn(),
  reintentar: vi.fn(),
  reiniciar: vi.fn(),
  estado: "en-cola" as string,
}))
vi.mock("./use-subida", () => ({
  useSubida: (opciones: OpcionesSubida<unknown>) => {
    subida.opciones = opciones
    return {
      estado: subida.estado,
      progreso: 0.4,
      error: null,
      intento: 0,
      reanudaEn: null,
      subir: subida.subir,
      reintentar: subida.reintentar,
      cancelar: vi.fn(),
      reiniciar: subida.reiniciar,
      activa: subida.estado === "subiendo",
    }
  },
}))

import { useCargaCaptura } from "./use-carga-captura"

const CAPTURA: ArchivoSubido = {
  nombre: "panel.png",
  tipo: "image/webp",
  tamano: 1000,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: true,
  bucket: "evidencias",
  ruta: "asignacion/a/publicacion/x.webp",
  rutaMiniatura: "asignacion/a/publicacion/x-min.webp",
}

const LISTA: ResultadoSubida<unknown> = {
  ok: true,
  datos: undefined,
  archivo: CAPTURA,
}
const FALLIDA: ResultadoSubida<unknown> = {
  ok: false,
  error: "Sin conexión",
  cancelada: false,
}

function diferida<T>() {
  let resolver: (valor: T) => void = () => {}
  const promesa = new Promise<T>((r) => {
    resolver = r
  })
  return { promesa, resolver }
}

const preparar = vi.fn()
const confirmar = vi.fn()

function montarHook() {
  return renderHook(() =>
    useCargaCaptura({
      preparar,
      confirmar,
      reglas: { mimes: ["image/webp"], maxBytes: 10 },
    })
  )
}

function montar() {
  return montarHook().result
}

beforeEach(() => {
  subida.subir.mockReset()
  subida.reintentar.mockReset()
  subida.reiniciar.mockReset()
  subida.estado = "en-cola"
  subida.opciones = null
  globalThis.URL.createObjectURL = vi.fn(() => "blob:vista")
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe("useCargaCaptura", () => {
  it("comprime, pide miniatura y usa las acciones de la feature", async () => {
    montar()
    expect(subida.opciones?.comprimir).toMatchObject({ maxLado: 1600 })
    expect(subida.opciones?.miniatura).toBe(true)
    confirmar.mockResolvedValue(exito())
    await subida.opciones?.confirmar(CAPTURA)
    expect(confirmar).toHaveBeenCalledWith(CAPTURA)
  })

  it("sin captura elegida no hay nada que obtener", async () => {
    const resultado = montar()
    await expect(resultado.current.obtener()).resolves.toBeNull()
    expect(subida.subir).not.toHaveBeenCalled()
  })

  it("empieza a subir en cuanto se elige y la entrega al terminar", async () => {
    const resultado = montar()
    const archivo = new File(["x"], "panel.png", { type: "image/png" })
    const espera = diferida<ResultadoSubida<unknown>>()
    subida.subir.mockReturnValue(espera.promesa)

    act(() => resultado.current.elegir(archivo))
    expect(subida.subir).toHaveBeenCalledWith(archivo)
    expect(resultado.current.elegida).toBe(archivo)
    expect(resultado.current.vistaPrevia).toBe("blob:vista")
    expect(resultado.current.lista).toBeNull()

    let obtenida: Awaited<ReturnType<typeof resultado.current.obtener>> = null
    await act(async () => {
      const pedido = resultado.current.obtener()
      espera.resolver(LISTA)
      obtenida = await pedido
    })
    expect(obtenida).toEqual({ ok: true, captura: CAPTURA })
    expect(resultado.current.lista).toEqual(CAPTURA)
    // No vuelve a subir: esperaba la subida en curso.
    expect(subida.subir).toHaveBeenCalledTimes(1)
  })

  it("si la subida falló, al enviar la retoma", async () => {
    const resultado = montar()
    subida.subir.mockResolvedValue(FALLIDA)
    subida.reintentar.mockResolvedValue(LISTA)
    await act(async () => {
      resultado.current.elegir(new File(["x"], "a.png", { type: "image/png" }))
    })
    let obtenida: Awaited<ReturnType<typeof resultado.current.obtener>> = null
    await act(async () => {
      obtenida = await resultado.current.obtener()
    })
    expect(subida.reintentar).toHaveBeenCalledTimes(1)
    expect(obtenida).toEqual({ ok: true, captura: CAPTURA })
  })

  it("informa el error si el reintento también falla", async () => {
    const resultado = montar()
    subida.subir.mockResolvedValue(FALLIDA)
    subida.reintentar.mockResolvedValue(FALLIDA)
    await act(async () => {
      resultado.current.elegir(new File(["x"], "a.png", { type: "image/png" }))
    })
    let obtenida: Awaited<ReturnType<typeof resultado.current.obtener>> = null
    await act(async () => {
      obtenida = await resultado.current.obtener()
    })
    expect(obtenida).toEqual({ ok: false, error: "Sin conexión" })
    expect(resultado.current.lista).toBeNull()
  })

  it("una captura cambiada mientras se esperaba no se entrega", async () => {
    const resultado = montar()
    const primera = diferida<ResultadoSubida<unknown>>()
    subida.subir
      .mockReturnValueOnce(primera.promesa)
      .mockReturnValueOnce(new Promise(() => {}))
    act(() =>
      resultado.current.elegir(new File(["1"], "a.png", { type: "image/png" }))
    )
    let obtenida: Awaited<ReturnType<typeof resultado.current.obtener>> = null
    await act(async () => {
      const pedido = resultado.current.obtener()
      resultado.current.elegir(new File(["2"], "b.png", { type: "image/png" }))
      primera.resolver(LISTA)
      obtenida = await pedido
    })
    expect(obtenida).toMatchObject({ ok: false })
    expect(resultado.current.lista).toBeNull()
  })

  it("descartar cancela y suelta la captura", () => {
    const resultado = montar()
    subida.subir.mockReturnValue(new Promise(() => {}))
    act(() =>
      resultado.current.elegir(new File(["x"], "a.png", { type: "image/png" }))
    )
    act(() => resultado.current.descartar())
    expect(subida.reiniciar).toHaveBeenCalled()
    expect(resultado.current.elegida).toBeNull()
    expect(resultado.current.lista).toBeNull()
  })

  it("muestra la subida en la lista mientras avanza, no al terminar", () => {
    subida.subir.mockReturnValue(new Promise(() => {}))
    subida.estado = "subiendo"
    const { result: resultado, rerender } = montarHook()
    act(() =>
      resultado.current.elegir(new File(["x"], "a.png", { type: "image/png" }))
    )
    expect(resultado.current.elemento).toMatchObject({
      nombre: "a.png",
      estado: "subiendo",
      progreso: 0.4,
    })
    subida.estado = "completada"
    rerender()
    expect(resultado.current.elemento).toBeNull()
  })
})
