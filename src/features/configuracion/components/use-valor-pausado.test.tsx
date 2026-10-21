import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PAUSA_BUSQUEDA_MS, useValorPausado } from "./use-valor-pausado"

describe("useValorPausado", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("entrega el valor inicial de inmediato", () => {
    const { result } = renderHook(() => useValorPausado("bog"))
    expect(result.current).toBe("bog")
  })

  it("solo entrega el último valor, cuando la persona deja de escribir", () => {
    const { result, rerender } = renderHook(
      ({ texto }) => useValorPausado(texto),
      { initialProps: { texto: "" } }
    )

    // Teclas seguidas, cada una antes de que venza la pausa.
    for (const texto of ["m", "me", "med", "mede", "medel", "medell"]) {
      rerender({ texto })
      act(() => {
        vi.advanceTimersByTime(PAUSA_BUSQUEDA_MS - 50)
      })
      expect(result.current).toBe("")
    }

    act(() => {
      vi.advanceTimersByTime(PAUSA_BUSQUEDA_MS)
    })
    expect(result.current).toBe("medell")
  })

  it("respeta una espera propia", () => {
    const { result, rerender } = renderHook(
      ({ texto }) => useValorPausado(texto, 1000),
      { initialProps: { texto: "a" } }
    )
    rerender({ texto: "ab" })
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(result.current).toBe("a")
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe("ab")
  })
})
