import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { type BarraSerie, BarrasSerie } from "./barras-serie"

const BARRAS: BarraSerie[] = [
  { valor: 10, parcial: true, etiqueta: "ago 2026", texto: "$10 M" },
  { valor: 40, parcial: false, etiqueta: "sept 2026", texto: "$40 M" },
  {
    valor: null,
    parcial: false,
    etiqueta: "oct 2026",
    texto: "Muestra insuficiente",
  },
  { valor: 20, parcial: true, etiqueta: "nov 2026", texto: "$20 M" },
]

function barras() {
  return screen.getAllByRole("listitem")
}

/** Relleno de la barra (el `li` es el área enfocable). */
function relleno(indice: number): HTMLElement {
  return barras()[indice].firstElementChild as HTMLElement
}

describe("BarrasSerie", () => {
  it("cada periodo dice su valor; el incompleto lo declara", () => {
    render(<BarrasSerie titulo="Evolución mensual" barras={BARRAS} />)
    expect(
      screen.getByRole("list", { name: /^Evolución mensual: usa las flechas/ })
    ).toBeInTheDocument()
    expect(barras().map((barra) => barra.getAttribute("aria-label"))).toEqual([
      "ago 2026: $10 M (periodo incompleto)",
      "sept 2026: $40 M",
      "oct 2026: Muestra insuficiente",
      "nov 2026: $20 M (periodo incompleto)",
    ])
  })

  it("el periodo incompleto se distingue por el borde, también cuando es el destacado", () => {
    render(<BarrasSerie titulo="Evolución mensual" barras={BARRAS} />)
    // La última barra es la destacada por defecto y además es parcial.
    expect(relleno(3).className).toContain("border-dashed")
    expect(relleno(0).className).toContain("border-dashed")
    expect(relleno(1).className).not.toContain("border-dashed")
    // La barra completa conserva su altura relativa al máximo.
    expect(relleno(1).style.height).toBe("100%")
    expect(relleno(0).style.height).toBe("25%")
  })

  it("un solo punto de tabulación; las flechas, Inicio y Fin recorren los periodos", () => {
    render(<BarrasSerie titulo="Evolución mensual" barras={BARRAS} />)
    expect(barras().map((barra) => barra.tabIndex)).toEqual([-1, -1, -1, 0])

    barras()[3].focus()
    fireEvent.keyDown(barras()[3], { key: "ArrowLeft" })
    expect(document.activeElement).toBe(barras()[2])
    expect(barras().map((barra) => barra.tabIndex)).toEqual([-1, -1, 0, -1])

    fireEvent.keyDown(barras()[2], { key: "Home" })
    expect(document.activeElement).toBe(barras()[0])
    // No se sale por los extremos.
    fireEvent.keyDown(barras()[0], { key: "ArrowLeft" })
    expect(document.activeElement).toBe(barras()[0])
    fireEvent.keyDown(barras()[0], { key: "End" })
    expect(document.activeElement).toBe(barras()[3])
  })

  it("la lectura visible sigue a la barra activa", () => {
    render(
      <BarrasSerie titulo="Evolución mensual" barras={BARRAS} nota="Nota." />
    )
    expect(screen.getByText("$20 M")).toBeInTheDocument()
    fireEvent.focus(barras()[1])
    expect(screen.getByText("$40 M")).toBeInTheDocument()
    expect(screen.queryByText("$20 M")).not.toBeInTheDocument()
    expect(screen.getByText("Nota.")).toBeInTheDocument()
  })
})
