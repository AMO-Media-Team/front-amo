import { act, renderHook } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { CATEGORICA, ORDINAL, SECUENCIAL } from "./paleta"
import { construirTemaGraficos, FUENTE_RESPALDO } from "./tema"
import { ContextoTemaForzado, useTemaGraficos } from "./use-tema-graficos"

describe("construirTemaGraficos", () => {
  it("sin lector usa las constantes del tema pedido", () => {
    const tema = construirTemaGraficos({ modo: "oscuro" })
    expect(tema.modo).toBe("oscuro")
    expect(tema.categorica).toEqual(CATEGORICA.oscuro)
    expect(tema.ordinal).toBe(ORDINAL.oscuro)
    expect(tema.secuencial).toBe(SECUENCIAL.oscuro)
    expect(tema.superficie).toBe("#15111f")
    expect(tema.fuente).toBe(FUENTE_RESPALDO)
    expect(tema.reducirMovimiento).toBe(false)
  })

  it("lee los tokens HEX del documento y normaliza mayúsculas", () => {
    const tokens: Record<string, string> = {
      "--card": " #FAFAFA",
      "--chart-1": "#123456",
      "--foreground": "#101010",
    }
    const tema = construirTemaGraficos({
      modo: "claro",
      leer: (variable) => tokens[variable] ?? "",
      fuente: "  Geist, sans-serif ",
      reducirMovimiento: true,
    })
    expect(tema.superficie).toBe("#fafafa")
    expect(tema.categorica[0]).toBe("#123456")
    expect(tema.categorica[1]).toBe(CATEGORICA.claro[1])
    expect(tema.texto).toBe("#101010")
    expect(tema.fuente).toBe("Geist, sans-serif")
    expect(tema.reducirMovimiento).toBe(true)
  })

  it("descarta tokens que no son HEX (Chart.js no entiende oklch)", () => {
    const tema = construirTemaGraficos({
      modo: "claro",
      leer: () => "oklch(0.62 0.2 290)",
    })
    expect(tema.categorica).toEqual(CATEGORICA.claro)
    expect(tema.primario).toBe("#7549de")
  })

  it("la rejilla queda entre el borde y la superficie", () => {
    const tema = construirTemaGraficos({ modo: "claro" })
    expect(tema.rejilla).not.toBe(tema.eje)
    expect(tema.rejilla).not.toBe(tema.superficie)
  })
})

describe("useTemaGraficos", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark")
  })

  it("se actualiza al alternar la clase del tema en <html>", async () => {
    const { result } = renderHook(() => useTemaGraficos())
    expect(result.current.modo).toBe("claro")

    await act(async () => {
      document.documentElement.classList.add("dark")
      // El MutationObserver notifica en una microtarea.
      await Promise.resolve()
    })
    expect(result.current.modo).toBe("oscuro")
    expect(result.current.superficie).toBe("#15111f")
  })

  it("devuelve el mismo objeto mientras el tema no cambie", () => {
    const { result, rerender } = renderHook(() => useTemaGraficos())
    const primero = result.current
    rerender()
    expect(result.current).toBe(primero)
  })
})

describe("ContextoTemaForzado", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark")
  })

  it("impone el tema pedido aunque el documento esté en otro", () => {
    document.documentElement.classList.add("dark")
    const envoltorio = ({ children }: { children: ReactNode }) =>
      createElement(
        ContextoTemaForzado,
        { value: { modo: "claro", densidad: 2 } },
        children
      )
    const { result } = renderHook(() => useTemaGraficos(), {
      wrapper: envoltorio,
    })
    expect(result.current).toMatchObject({
      modo: "claro",
      superficie: "#ffffff",
      reducirMovimiento: true,
      densidad: 2,
      captura: true,
    })
  })
})
