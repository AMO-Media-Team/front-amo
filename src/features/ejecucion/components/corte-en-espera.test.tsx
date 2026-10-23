import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const navegacion = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))

import { CorteEnEspera } from "./corte-en-espera"

const AHORA = new Date("2026-10-23T20:00:00.000Z")
const TEXTO = {
  titulo: "Las métricas de 72 horas aún no están listas",
  descripcion: "Se habilitan pronto.",
}

afterEach(() => {
  vi.useRealTimers()
  navegacion.refresh.mockReset()
})

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe("CorteEnEspera", () => {
  it("cuenta el tiempo que falta y no recarga antes de la hora", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
    render(
      <CorteEnEspera
        desde="2026-10-24T01:30:00.000Z"
        texto={TEXTO}
        ahoraServidor={AHORA.getTime()}
      />
    )
    expect(screen.getByText(TEXTO.titulo)).toBeInTheDocument()
    expect(screen.getByText(/Se habilita en 5 h 30 min/)).toBeInTheDocument()
    expect(navegacion.refresh).not.toHaveBeenCalled()
  })

  it("al llegar la hora vuelve a pintar la página con el formulario", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
    render(
      <CorteEnEspera
        desde="2026-10-23T20:00:20.000Z"
        texto={TEXTO}
        ahoraServidor={AHORA.getTime()}
      />
    )
    expect(navegacion.refresh).not.toHaveBeenCalled()
    await avanzar(31_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(1)
  })

  it("si el servidor aún lo ve bloqueado (reloj del celular adelantado), reintenta con espera creciente", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
    const { rerender, unmount } = render(
      <CorteEnEspera
        desde="2026-10-23T20:00:20.000Z"
        texto={TEXTO}
        ahoraServidor={AHORA.getTime()}
      />
    )
    await avanzar(31_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(1)
    // La respuesta vuelve a pintar la espera (con la hora del servidor, aún antes del corte).
    rerender(
      <CorteEnEspera
        desde="2026-10-23T20:00:20.000Z"
        texto={TEXTO}
        ahoraServidor={new Date("2026-10-23T20:00:19.500Z").getTime()}
      />
    )
    await avanzar(2_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(2)
    await avanzar(4_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(3)
    await avanzar(8_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(4)
    // Con el formulario en pantalla la espera se desmonta y deja de pedir.
    unmount()
    await avanzar(60_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(4)
  })

  it("la espera entre reintentos no pasa del paso del reloj", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-23T20:01:00.000Z"))
    render(
      <CorteEnEspera
        desde="2026-10-23T20:00:00.000Z"
        texto={TEXTO}
        ahoraServidor={AHORA.getTime()}
      />
    )
    // Ya llegó según el celular: pide de inmediato y luego a los 2, 4, 8, 16 y 30 s.
    await avanzar(0)
    expect(navegacion.refresh).toHaveBeenCalledTimes(1)
    await avanzar(2_000 + 4_000 + 8_000 + 16_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(5)
    await avanzar(29_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(5)
    await avanzar(1_000)
    expect(navegacion.refresh).toHaveBeenCalledTimes(6)
  })
})
