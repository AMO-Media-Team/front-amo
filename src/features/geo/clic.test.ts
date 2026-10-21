import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  crearDiscriminadorClic,
  RETARDO_DOBLE_CLIC_MS,
  tipoPuntero,
} from "./clic"

function preparar() {
  const alSeleccionar = vi.fn<(codigo: string) => void>()
  const alExplorar = vi.fn<(codigo: string) => void>()
  const discriminador = crearDiscriminadorClic<string>({
    alSeleccionar,
    alExplorar,
  })
  return { alSeleccionar, alExplorar, discriminador }
}

describe("discriminador de clic y doble clic", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("con ratón, el clic selecciona tras 250 ms", () => {
    const { alSeleccionar, alExplorar, discriminador } = preparar()
    discriminador.clic("05", "mouse")
    vi.advanceTimersByTime(RETARDO_DOBLE_CLIC_MS - 1)
    expect(alSeleccionar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(alSeleccionar).toHaveBeenCalledExactlyOnceWith("05")
    expect(alExplorar).not.toHaveBeenCalled()
  })

  it("el doble clic de escritorio explora y descarta la selección pendiente", () => {
    const { alSeleccionar, alExplorar, discriminador } = preparar()
    // El navegador emite clic, clic y dblclick.
    discriminador.clic("05", "mouse")
    discriminador.clic("05", "mouse")
    discriminador.dobleClic("05", "mouse")
    vi.advanceTimersByTime(RETARDO_DOBLE_CLIC_MS * 2)
    expect(alExplorar).toHaveBeenCalledExactlyOnceWith("05")
    expect(alSeleccionar).not.toHaveBeenCalled()
  })

  it("con tacto, el toque selecciona al instante y el doble toque se ignora", () => {
    const { alSeleccionar, alExplorar, discriminador } = preparar()
    discriminador.clic("76", "touch")
    expect(alSeleccionar).toHaveBeenCalledExactlyOnceWith("76")
    discriminador.clic("76", "touch")
    discriminador.dobleClic("76", "touch")
    vi.runAllTimers()
    expect(alExplorar).not.toHaveBeenCalled()
    expect(alSeleccionar).toHaveBeenCalledTimes(2)
  })

  it("un segundo clic en otra zona reemplaza al pendiente", () => {
    const { alSeleccionar, discriminador } = preparar()
    discriminador.clic("05", "mouse")
    vi.advanceTimersByTime(100)
    discriminador.clic("08", "pen")
    vi.runAllTimers()
    expect(alSeleccionar).toHaveBeenCalledExactlyOnceWith("08")
  })

  it("limpiar descarta un clic pendiente (cambio de nivel, desmontaje)", () => {
    const { alSeleccionar, discriminador } = preparar()
    discriminador.clic("05", "mouse")
    discriminador.limpiar()
    vi.runAllTimers()
    expect(alSeleccionar).not.toHaveBeenCalled()
  })

  it("normaliza el tipo de puntero (vacío o desconocido cuenta como ratón)", () => {
    expect(tipoPuntero("touch")).toBe("touch")
    expect(tipoPuntero("pen")).toBe("pen")
    expect(tipoPuntero("")).toBe("mouse")
    expect(tipoPuntero(undefined)).toBe("mouse")
    expect(tipoPuntero("kinect")).toBe("mouse")
  })
})
