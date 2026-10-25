import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { Reputacion } from "../tipos"
import { ResumenReputacion } from "./resumen-reputacion"

function reputacion(parcial: Partial<Reputacion> = {}): Reputacion {
  return {
    tasa: null,
    n: 2,
    cumplidas: 2,
    nMinimo: 3,
    publicacionesTotal: 1250,
    publicaciones180d: 1,
    calculadaAt: "2026-10-24T15:00:00Z",
    casos: [],
    ...parcial,
  }
}

describe("ResumenReputacion", () => {
  it("con dos negocios resueltos muestra «Sin historial suficiente» en lugar de una tasa (MED-016)", () => {
    render(<ResumenReputacion reputacion={reputacion()} multiplicador={null} />)
    expect(
      screen.getByRole("region", { name: "Resumen de tu reputación" })
    ).toBeInTheDocument()
    expect(screen.getByText("Sin historial suficiente")).toBeInTheDocument()
    expect(
      screen.getByText(
        "2 de 3 negocios en los últimos 180 días. Con 3 negocios o más calculamos tu tasa."
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole("meter")).not.toBeInTheDocument()
  })

  it("con la tasa la dibuja frente a la meta y la anuncia como medidor", () => {
    render(
      <ResumenReputacion
        reputacion={reputacion({ tasa: 0.8, n: 10, cumplidas: 8 })}
        multiplicador={{ valor: 1.15, nota: "La más baja de tus 2 cuentas" }}
      />
    )
    expect(screen.getByText("80%")).toBeInTheDocument()
    const medidor = screen.getByRole("meter", {
      name: "Tasa de cumplimiento",
    })
    expect(medidor).toHaveAttribute("aria-valuenow", "80")
    expect(medidor).toHaveAttribute("aria-valuetext", "80%; meta 90%")
    expect(screen.getByText("1,15 ×")).toBeInTheDocument()
    expect(screen.getByText("La más baja de tus 2 cuentas")).toBeInTheDocument()
  })

  it("las publicaciones, totales y de la ventana; la calificación aún no llega", () => {
    render(<ResumenReputacion reputacion={reputacion()} multiplicador={null} />)
    const terminos = screen.getAllByRole("term").map((t) => t.textContent)
    expect(terminos).toEqual([
      "Publicaciones realizadas",
      "Multiplicador de calidad",
      "Calificación promedio",
    ])
    expect(screen.getByText("1.250")).toBeInTheDocument()
    expect(
      screen.getByText("1 publicación en los últimos 180 días")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Llega con la calificación de los anunciantes")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Lo verás cuando tengas una cuenta verificada")
    ).toBeInTheDocument()
  })
})
