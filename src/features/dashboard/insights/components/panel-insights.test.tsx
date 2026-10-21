import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { Insight } from "../tipos"
import { EsqueletoPanelInsights } from "./esqueleto-panel-insights"
import { PanelInsights } from "./panel-insights"

const SEVERIDADES = [
  "critico",
  "atencion",
  "atencion",
  "positivo",
  "info",
  "info",
] as const

const INSIGHTS: Insight[] = SEVERIDADES.map((severidad, i) => ({
  id: `i${i}`,
  regla: 1,
  severidad,
  titulo: `Hallazgo ${i + 1}`,
  detalle: `Detalle ${i + 1}.`,
  magnitud: 1 - i / 10,
  accion: { etiqueta: `Acción ${i + 1}`, href: "/inicio" },
}))

describe("PanelInsights", () => {
  it("muestra los 4 primeros y el resto tras «Ver todos»", async () => {
    const usuario = userEvent.setup()
    render(<PanelInsights insights={INSIGHTS} />)
    const lista = screen.getByRole("list")
    expect(within(lista).getAllByRole("listitem")).toHaveLength(4)

    const boton = screen.getByRole("button", { name: "Ver todos (6)" })
    expect(boton).toHaveAttribute("aria-expanded", "false")
    await usuario.click(boton)
    expect(within(lista).getAllByRole("listitem")).toHaveLength(6)
    expect(screen.getByRole("button", { name: "Ver menos" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  it("la severidad se lee además de verse y la acción enlaza", () => {
    render(<PanelInsights insights={INSIGHTS.slice(0, 1)} />)
    expect(screen.getByText("Crítico:", { exact: false })).toHaveClass(
      "sr-only"
    )
    expect(screen.getByRole("link", { name: /Acción 1/ })).toHaveAttribute(
      "href",
      "/inicio"
    )
    expect(
      screen.queryByRole("button", { name: /Ver todos/ })
    ).not.toBeInTheDocument()
    expect(screen.getByText("1 hallazgo, 1 crítico")).toHaveClass("sr-only")
  })

  it("sin hallazgos lo dice con un estado positivo", () => {
    render(<PanelInsights insights={[]} />)
    expect(screen.getByText("Todo en orden")).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})

describe("EsqueletoPanelInsights", () => {
  it("anuncia la carga una sola vez para todo el panel", () => {
    render(<EsqueletoPanelInsights cantidad={4} />)
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(screen.getByRole("status")).toHaveTextContent("Cargando hallazgos…")
  })
})
