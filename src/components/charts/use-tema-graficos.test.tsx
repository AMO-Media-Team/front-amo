import { act } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { construirTemaGraficos } from "./tema"
import { temaDeInstantanea, useTemaGraficos } from "./use-tema-graficos"

const MUTED_CLARO = construirTemaGraficos({ modo: "claro" }).vacio
const MUTED_OSCURO = construirTemaGraficos({ modo: "oscuro" }).vacio

/** "#241d35" → "rgb(36, 29, 53)", como lo devuelve `style.backgroundColor`. */
function rgb(hex: string): string {
  const canales = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${canales.join(", ")})`
}

/** Como la leyenda «Sin actividad»: el color del tema va en un estilo en línea. */
function Muestra() {
  const tema = useTemaGraficos()
  return <span data-testid="muestra" style={{ backgroundColor: tema.vacio }} />
}

function fijarTemaDelDocumento(oscuro: boolean, muted: string) {
  const raiz = document.documentElement
  raiz.classList.toggle("dark", oscuro)
  raiz.style.setProperty("--muted", muted)
}

afterEach(() => {
  document.documentElement.classList.remove("dark")
  document.documentElement.style.removeProperty("--muted")
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("temaDeInstantanea", () => {
  it("lee los tokens del documento cuando coinciden con el modo pedido", () => {
    fijarTemaDelDocumento(false, "#abcdef")
    expect(temaDeInstantanea("claro|0").vacio).toBe("#abcdef")
  })

  it("ignora los tokens del otro tema (instantánea del servidor al hidratar)", () => {
    fijarTemaDelDocumento(false, MUTED_CLARO)
    const tema = temaDeInstantanea("oscuro|1")
    expect(tema).toEqual(
      construirTemaGraficos({ modo: "oscuro", reducirMovimiento: true })
    )
    expect(tema.vacio).toBe(MUTED_OSCURO)
  })
})

describe("useTemaGraficos al hidratar", () => {
  it("en tema claro repite el render del servidor y luego pinta el tema real", async () => {
    fijarTemaDelDocumento(false, MUTED_CLARO)
    const errores = vi.spyOn(console, "error").mockImplementation(() => {})
    const recuperables = vi.fn()

    const contenedor = document.createElement("div")
    contenedor.innerHTML = renderToString(<Muestra />)
    document.body.append(contenedor)
    const muestra = contenedor.querySelector("span")
    // El servidor no conoce el tema del navegador: asume el oscuro.
    expect(muestra?.style.backgroundColor).toBe(rgb(MUTED_OSCURO))

    await act(async () => {
      hydrateRoot(contenedor, <Muestra />, {
        onRecoverableError: recuperables,
      })
    })

    expect(errores).not.toHaveBeenCalled()
    expect(recuperables).not.toHaveBeenCalled()
    // Mismo nodo (hidratado, no recreado) y ya con el color del tema claro.
    expect(contenedor.querySelector("span")).toBe(muestra)
    expect(muestra?.style.backgroundColor).toBe(rgb(MUTED_CLARO))
  })
})
