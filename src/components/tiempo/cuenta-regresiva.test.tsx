import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CuentaRegresiva } from "./cuenta-regresiva"
import { PASO_RELOJ_MS } from "./use-ahora"

const AHORA = new Date("2026-10-21T15:00:00.000Z")
const en = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000).toISOString()

describe("CuentaRegresiva", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("muestra el plazo con su fecha exacta y la urgencia en texto", () => {
    render(
      <CuentaRegresiva
        venceAt={en(4 * 60 + 12)}
        ahoraServidor={AHORA.getTime()}
        etiqueta="Publicación"
      />
    )
    const tiempo = screen.getByText(/Vence en 4 h 12 min/).closest("time")
    expect(tiempo).toHaveAttribute("dateTime", en(4 * 60 + 12))
    expect(tiempo).toHaveAttribute("data-urgencia", "critica")
    expect(tiempo?.getAttribute("title")).toMatch(
      /^Publicación · Fecha límite:/
    )
    expect(tiempo).toHaveTextContent("(urgente)")
  })

  it("sin fecha límite lo dice y no anuncia nada", () => {
    render(<CuentaRegresiva venceAt={null} ahoraServidor={AHORA.getTime()} />)
    expect(screen.getByText("Sin fecha límite")).toBeInTheDocument()
    expect(document.querySelector("[aria-live]")).toBeEmptyDOMElement()
  })

  it("se actualiza con el reloj y anuncia cuando la urgencia sube", () => {
    // 6 h y 10 s: «pronto» al montar, «crítica» en el siguiente paso del reloj.
    const vence = new Date(AHORA.getTime() + 6 * 3_600_000 + 10_000)
    render(
      <CuentaRegresiva
        venceAt={vence}
        ahoraServidor={AHORA.getTime()}
        etiqueta="Publicación"
      />
    )
    expect(screen.getByText("Vence en 6 h")).toBeInTheDocument()
    const aviso = document.querySelector("[aria-live='polite']")
    // Al montar no se anuncia: el texto ya está a la vista.
    expect(aviso).toBeEmptyDOMElement()

    act(() => {
      vi.advanceTimersByTime(PASO_RELOJ_MS + 100)
    })
    expect(screen.getByText(/Vence en 5 h 59 min/)).toBeInTheDocument()
    expect(aviso).toHaveTextContent(
      "Publicación: vence en 5 h 59 min. Es urgente."
    )
  })
})
