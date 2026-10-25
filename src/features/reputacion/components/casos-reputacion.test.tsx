import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { CasoReputacion } from "../tipos"
import { CASOS_VISIBLES, CasosReputacion } from "./casos-reputacion"

function casos(cantidad: number): CasoReputacion[] {
  return Array.from({ length: cantidad }, (_, indice) => ({
    asignacionId: `a${indice + 1}`,
    oferta: `Oferta ${indice + 1}`,
    limite: `2026-10-${String(20 - indice).padStart(2, "0")}T23:59:00-05:00`,
    estado: indice === 1 ? "VENCIDA_SIN_PUBLICAR" : "VERIFICADA",
    cumplida: indice !== 1,
  }))
}

function lista() {
  return screen.getByRole("list", {
    name: "Negocios de los últimos 180 días",
  })
}

describe("CasosReputacion", () => {
  it("sin negocios en la ventana lo explica", () => {
    render(<CasosReputacion casos={[]} nMinimo={3} enlazar />)
    expect(
      screen.getByText(/Aún no tienes negocios con fecha límite/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: /Negocios/ })).toBeNull()
  })

  it("cada negocio dice si se cumplió y por qué, y lleva a su ficha", () => {
    render(<CasosReputacion casos={casos(2)} nMinimo={3} enlazar />)
    expect(
      screen.getByText(
        "2 negocios con fecha límite en la ventana, 1 sin cumplir. Del más reciente al más antiguo."
      )
    ).toBeInTheDocument()
    const [cumplido, fallido] = within(lista()).getAllByRole("listitem")
    expect(cumplido).toHaveTextContent("Cumplido")
    expect(
      within(cumplido).getByRole("link", { name: "Oferta 1" })
    ).toHaveAttribute("href", "/mis-campanas/a1")
    expect(fallido).toHaveTextContent("No cumplido")
    expect(fallido).toHaveTextContent(
      "Pasó la fecha límite sin la evidencia de la publicación."
    )
  })

  it("sin acceso a «Mis campañas» no enlaza", () => {
    render(<CasosReputacion casos={casos(2)} nMinimo={3} enlazar={false} />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(within(lista()).getByText("Oferta 1")).toBeInTheDocument()
  })

  it("despliega los restantes y lleva el foco al primero que aparece", async () => {
    const usuario = userEvent.setup()
    render(
      <CasosReputacion casos={casos(CASOS_VISIBLES + 2)} nMinimo={3} enlazar />
    )
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(
      CASOS_VISIBLES
    )
    const boton = screen.getByRole("button", { name: "Ver los 2 restantes" })
    expect(boton).toHaveAttribute("aria-expanded", "false")

    await usuario.click(boton)
    const items = within(lista()).getAllByRole("listitem")
    expect(items).toHaveLength(CASOS_VISIBLES + 2)
    expect(items[CASOS_VISIBLES]).toHaveFocus()
    expect(screen.getByRole("button", { name: "Ver menos" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  })

  it("explica qué cuenta para el cumplimiento, plegado", async () => {
    const usuario = userEvent.setup()
    render(<CasosReputacion casos={casos(1)} nMinimo={5} enlazar />)
    const pliegue = screen.getByRole("button", {
      name: "¿Qué cuenta para tu cumplimiento?",
    })
    expect(pliegue).toHaveAttribute("aria-expanded", "false")
    await usuario.click(pliegue)
    expect(
      await screen.findByText(
        "Con menos de 5 negocios no mostramos una tasa: diría poco de tu trabajo."
      )
    ).toBeVisible()
  })
})
