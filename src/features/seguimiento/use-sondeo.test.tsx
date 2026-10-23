import { act, renderHook } from "@testing-library/react"
import { useTransition } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type Consulta, INTERVALO_SONDEO_MS, useSondeo } from "./use-sondeo"

const AHORA = new Date("2026-10-16T15:00:00.000Z").getTime()

let visibilidad: DocumentVisibilityState = "visible"

function cambiarVisibilidad(estado: DocumentVisibilityState) {
  visibilidad = estado
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(AHORA)
  visibilidad = "visible"
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibilidad
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Deja correr el tiempo y las promesas que la consulta encadena. */
async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/**
 * Resuelve una consulta en curso. Cada prueba deja resueltas las suyas: React
 * mantiene pendientes juntas todas las transiciones asíncronas, y una que
 * quede colgada dejaría `consultando` en `true` en las pruebas siguientes.
 */
async function terminarConsulta(terminar: () => void) {
  await act(async () => {
    terminar()
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe("useSondeo", () => {
  it("consulta cada minuto contado desde la última consulta", async () => {
    const consultar = vi.fn(async () => {})
    renderHook(() => useSondeo(consultar, { ultimaConsulta: AHORA }))

    await avanzar(INTERVALO_SONDEO_MS - 1)
    expect(consultar).not.toHaveBeenCalled()
    await avanzar(1)
    expect(consultar).toHaveBeenCalledTimes(1)
    await avanzar(INTERVALO_SONDEO_MS)
    expect(consultar).toHaveBeenCalledTimes(2)
  })

  it("con datos de hace más de un minuto consulta enseguida al montar", async () => {
    const consultar = vi.fn(async () => {})
    renderHook(() =>
      useSondeo(consultar, { ultimaConsulta: AHORA - 5 * INTERVALO_SONDEO_MS })
    )
    await avanzar(0)
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it("con la pestaña oculta no consulta y, al volver, se pone al día", async () => {
    const consultar = vi.fn(async () => {})
    renderHook(() => useSondeo(consultar, { ultimaConsulta: AHORA }))

    cambiarVisibilidad("hidden")
    await avanzar(3 * INTERVALO_SONDEO_MS)
    expect(consultar).not.toHaveBeenCalled()

    await act(async () => cambiarVisibilidad("visible"))
    await avanzar(0)
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it("al volver antes del minuto no consulta de más", async () => {
    const consultar = vi.fn(async () => {})
    renderHook(() => useSondeo(consultar, { ultimaConsulta: AHORA }))
    cambiarVisibilidad("hidden")
    await avanzar(10_000)
    await act(async () => cambiarVisibilidad("visible"))
    expect(consultar).not.toHaveBeenCalled()
  })

  it("«Actualizar» consulta ya, no superpone consultas y reinicia el minuto", async () => {
    let terminar: () => void = () => {}
    const consultar = vi.fn(
      () =>
        new Promise<void>((resolver) => {
          terminar = resolver
        })
    )
    const { result } = renderHook(() =>
      useSondeo(consultar, { ultimaConsulta: AHORA })
    )
    await avanzar(30_000)

    act(() => result.current.consultarAhora())
    expect(result.current.consultando).toBe(true)
    expect(result.current.actualizandoAMano).toBe(true)
    expect(consultar).toHaveBeenLastCalledWith({ aMano: true })
    act(() => result.current.consultarAhora())
    expect(consultar).toHaveBeenCalledTimes(1)

    await act(async () => {
      terminar()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.consultando).toBe(false)
    expect(result.current.actualizandoAMano).toBe(false)

    // El siguiente minuto se cuenta desde esta consulta, no desde el montaje.
    await avanzar(INTERVALO_SONDEO_MS - 1)
    expect(consultar).toHaveBeenCalledTimes(1)
    await avanzar(1)
    expect(consultar).toHaveBeenCalledTimes(2)
    await terminarConsulta(terminar)
  })

  it("la consulta automática no cuenta como pedida; «Actualizar» durante ella la hace suya", async () => {
    let terminar: () => void = () => {}
    const consultar = vi.fn(
      (_consulta: Consulta) =>
        new Promise<void>((resolver) => {
          terminar = resolver
        })
    )
    const { result } = renderHook(() =>
      useSondeo(consultar, { ultimaConsulta: AHORA })
    )

    await avanzar(INTERVALO_SONDEO_MS)
    expect(result.current.consultando).toBe(true)
    // El botón no muestra que carga ni se deshabilita por el sondeo.
    expect(result.current.actualizandoAMano).toBe(false)
    const consulta = consultar.mock.calls[0]?.[0]
    expect(consulta).toEqual({ aMano: false })

    act(() => result.current.consultarAhora())
    expect(consultar).toHaveBeenCalledTimes(1)
    expect(result.current.actualizandoAMano).toBe(true)
    expect(consulta).toEqual({ aMano: true })

    await act(async () => {
      terminar()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.actualizandoAMano).toBe(false)
    // La siguiente automática vuelve a ser discreta.
    await avanzar(INTERVALO_SONDEO_MS)
    expect(consultar).toHaveBeenCalledTimes(2)
    expect(consultar).toHaveBeenLastCalledWith({ aMano: false })
    expect(result.current.actualizandoAMano).toBe(false)
    await terminarConsulta(terminar)
  })

  it("«Actualizar» se libera al terminar su consulta aunque otra transición de la página siga en curso", async () => {
    // React deja pendientes juntas todas las transiciones asíncronas.
    let soltarOtra: () => void = () => {}
    const otra = renderHook(() => useTransition())
    act(() => {
      const [, iniciarOtra] = otra.result.current
      iniciarOtra(
        () =>
          new Promise<void>((resolver) => {
            soltarOtra = resolver
          })
      )
    })
    let terminar: () => void = () => {}
    const consultar = vi.fn(
      () =>
        new Promise<void>((resolver) => {
          terminar = resolver
        })
    )
    const { result } = renderHook(() =>
      useSondeo(consultar, { ultimaConsulta: AHORA })
    )

    act(() => result.current.consultarAhora())
    expect(result.current.actualizandoAMano).toBe(true)
    await terminarConsulta(terminar)
    expect(result.current.actualizandoAMano).toBe(false)

    await terminarConsulta(soltarOtra)
  })

  it("si el reloj del sistema se atrasa, el temporizador manda y el sondeo sigue", async () => {
    const consultar = vi.fn(async () => {})
    renderHook(() => useSondeo(consultar, { ultimaConsulta: AHORA }))

    await avanzar(INTERVALO_SONDEO_MS - 1_000)
    // Un ajuste del reloj de pared (NTP) no mueve el temporizador: se dispara
    // con `Date.now()` un segundo antes de lo previsto.
    vi.setSystemTime(Date.now() - 1_000)
    await avanzar(1_000)
    expect(consultar).toHaveBeenCalledTimes(1)
    await avanzar(INTERVALO_SONDEO_MS)
    expect(consultar).toHaveBeenCalledTimes(2)
  })

  it("con el reloj del navegador atrasado frente al servidor no espera más de un minuto", async () => {
    const consultar = vi.fn(async () => {})
    renderHook(() =>
      useSondeo(consultar, { ultimaConsulta: AHORA + 10 * INTERVALO_SONDEO_MS })
    )
    await avanzar(INTERVALO_SONDEO_MS)
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it("al desmontarse deja de consultar", async () => {
    const consultar = vi.fn(async () => {})
    const { unmount } = renderHook(() =>
      useSondeo(consultar, { ultimaConsulta: AHORA })
    )
    unmount()
    await avanzar(3 * INTERVALO_SONDEO_MS)
    expect(consultar).not.toHaveBeenCalled()
  })
})
