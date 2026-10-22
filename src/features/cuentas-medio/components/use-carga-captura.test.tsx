import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OpcionesSubida } from "@/components/archivos/motor-subida"
import type { ArchivoSubido, DescripcionArchivo } from "@/lib/archivos/tipos"
import { exito } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  prepararCaptura: vi.fn(),
  enviarVerificacionManual: vi.fn(),
  enviarCapturaCodigo: vi.fn(),
}))
vi.mock("../actions", () => acciones)

/** `useSubida` falso: guarda las opciones y resuelve la subida al instante. */
const subida = vi.hoisted(() => ({
  opciones: null as OpcionesSubida<unknown> | null,
  subir: vi.fn(),
  reiniciar: vi.fn(),
}))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: (opciones: OpcionesSubida<unknown>) => {
    subida.opciones = opciones
    return {
      estado: "en-cola",
      progreso: 0,
      error: null,
      intento: 0,
      reanudaEn: null,
      subir: subida.subir,
      reintentar: vi.fn(),
      cancelar: vi.fn(),
      reiniciar: subida.reiniciar,
      activa: false,
    }
  },
}))

import { useCargaCaptura } from "./use-carga-captura"

const DESCRIPCION: DescripcionArchivo = {
  nombre: "captura.webp",
  tipo: "image/webp",
  tamano: 1000,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: false,
}

const SUBIDA: ArchivoSubido = {
  ...DESCRIPCION,
  bucket: "documentos",
  ruta: "medio/m/cuenta_social/c/a.webp",
  rutaMiniatura: null,
}

beforeEach(() => {
  for (const accion of Object.values(acciones)) accion.mockReset()
  subida.subir.mockReset()
  subida.reiniciar.mockReset()
  subida.opciones = null
  globalThis.URL.createObjectURL = vi.fn(() => "blob:vista")
  globalThis.URL.revokeObjectURL = vi.fn()
})

function montar() {
  const alCompletar = vi.fn()
  const { result } = renderHook(() => useCargaCaptura("cuenta-1", alCompletar))
  return { result, alCompletar }
}

describe("useCargaCaptura", () => {
  it("firma la subida para la cuenta, comprimiendo la captura", async () => {
    montar()
    acciones.prepararCaptura.mockResolvedValue(exito({}))
    await subida.opciones?.preparar(DESCRIPCION)
    expect(acciones.prepararCaptura).toHaveBeenCalledWith({
      cuentaId: "cuenta-1",
      descripcion: DESCRIPCION,
    })
    expect(subida.opciones?.comprimir).toBeDefined()
  })

  it("sin captura elegida no envía nada", async () => {
    const { result } = montar()
    let enviada = true
    await act(async () => {
      enviada = await result.current.enviar({
        metodo: "MANUAL",
        seguidores: "45.000",
      })
    })
    expect(enviada).toBe(false)
    expect(subida.subir).not.toHaveBeenCalled()
  })

  it("una captura de estadísticas va a la verificación manual con los seguidores", async () => {
    const { result, alCompletar } = montar()
    const archivo = new File(["x"], "panel.png", { type: "image/png" })
    act(() => result.current.elegir(archivo))
    expect(result.current.elegida).toBe(archivo)
    expect(result.current.vistaPrevia).toBe("blob:vista")

    acciones.enviarVerificacionManual.mockResolvedValue(
      exito({ verificacionId: "v-1" })
    )
    subida.subir.mockImplementation(async () => {
      const confirmado = await subida.opciones?.confirmar(SUBIDA)
      return confirmado?.ok
        ? { ok: true, datos: confirmado.datos, archivo: SUBIDA }
        : { ok: false, error: "x", cancelada: false }
    })
    let enviada = false
    await act(async () => {
      enviada = await result.current.enviar({
        metodo: "MANUAL",
        seguidores: "45.000",
      })
    })
    expect(enviada).toBe(true)
    expect(subida.subir).toHaveBeenCalledWith(archivo)
    expect(acciones.enviarVerificacionManual).toHaveBeenCalledWith({
      cuentaId: "cuenta-1",
      seguidores: "45.000",
      captura: SUBIDA,
    })
    expect(alCompletar).toHaveBeenCalledOnce()
    expect(result.current.elegida).toBeNull()
  })

  it("la captura de la historia va a la verificación del código", async () => {
    const { result, alCompletar } = montar()
    act(() =>
      result.current.elegir(
        new File(["x"], "historia.png", { type: "image/png" })
      )
    )
    acciones.enviarCapturaCodigo.mockResolvedValue(
      exito({ verificacionId: "v-2" })
    )
    subida.subir.mockImplementation(async () => {
      await subida.opciones?.confirmar(SUBIDA)
      return { ok: false, error: "Sin conexión", cancelada: false }
    })
    let enviada = true
    await act(async () => {
      enviada = await result.current.enviar({
        metodo: "CODIGO_HISTORIA",
        verificacionId: "v-2",
      })
    })
    expect(acciones.enviarCapturaCodigo).toHaveBeenCalledWith({
      verificacionId: "v-2",
      captura: SUBIDA,
    })
    // Un fallo conserva la captura elegida para reintentar.
    expect(enviada).toBe(false)
    expect(alCompletar).not.toHaveBeenCalled()
    expect(result.current.elegida).not.toBeNull()
  })

  it("confirmar sin destino devuelve un fallo en lugar de lanzar", async () => {
    montar()
    const resultado = await subida.opciones?.confirmar(SUBIDA)
    expect(resultado).toMatchObject({ ok: false })
  })
})
