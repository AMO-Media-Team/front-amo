import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MiniMapaColombia } from "./mini-mapa-colombia"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const VALORES = { "05": 123, "11": 122, "76": 82, "08": 0, "91": null }

describe("MiniMapaColombia", () => {
  it("dibuja los 33 departamentos con nombre y cifra accesibles", () => {
    render(
      <MiniMapaColombia
        valores={VALORES}
        metrica="medios"
        etiqueta="Medios por departamento"
        enlazar
      />
    )
    expect(
      screen.getByRole("group", { name: "Medios por departamento" })
    ).toBeInTheDocument()
    expect(screen.getAllByRole("link")).toHaveLength(33)
    expect(
      screen.getByRole("link", { name: "Antioquia: 123" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /^Amazonas: Sin datos$/ })
    ).toBeInTheDocument()
  })

  it("cada departamento abre el explorador con la métrica del mapa; Bogotá abre el mapa nacional", () => {
    render(
      <MiniMapaColombia
        valores={VALORES}
        metrica="medios"
        etiqueta="Medios"
        enlazar
      />
    )
    fireEvent.click(screen.getByRole("link", { name: /^Antioquia/ }))
    expect(push).toHaveBeenLastCalledWith(
      "/analitica/mapa?metrica=medios&nivel=departamental&depto=05"
    )
    fireEvent.keyDown(screen.getByRole("link", { name: /^Bogotá/ }), {
      key: "Enter",
    })
    expect(push).toHaveBeenLastCalledWith("/analitica/mapa?metrica=medios")
  })

  it("los enlaces conservan el periodo de las cifras", () => {
    render(
      <MiniMapaColombia
        valores={VALORES}
        metrica="gmv"
        etiqueta="GMV"
        enlazar
        periodo={{ desde: "2026-09-01", hasta: "2026-09-30" }}
      />
    )
    fireEvent.click(screen.getByRole("link", { name: /^Valle del Cauca/ }))
    expect(push).toHaveBeenLastCalledWith(
      "/analitica/mapa?metrica=gmv&nivel=departamental&depto=76&desde=2026-09-01&hasta=2026-09-30"
    )
  })

  it("sin enlaces no expone controles, pero cada cifra sigue siendo legible", () => {
    render(
      <MiniMapaColombia valores={VALORES} metrica="medios" etiqueta="Medios" />
    )
    expect(screen.queryAllByRole("link")).toHaveLength(0)
    expect(
      screen.getByRole("img", { name: "Antioquia: 123" })
    ).not.toHaveAttribute("tabindex")
    expect(screen.getByText("Sin datos")).toBeInTheDocument()
  })

  it("nombra las zonas sin dato como pida quien lo usa (leyenda y cada zona)", () => {
    render(
      <MiniMapaColombia
        valores={VALORES}
        metrica="accesos"
        etiqueta="Ingresos por departamento"
        etiquetaSinDatos="Sin ingresos"
      />
    )
    expect(screen.getByText("Sin ingresos")).toBeInTheDocument()
    expect(screen.queryByText("Sin datos")).not.toBeInTheDocument()
    expect(
      screen.getByRole("img", { name: "Amazonas: Sin ingresos" })
    ).toBeInTheDocument()
    // Un cero es un dato: conserva su cifra.
    expect(
      screen.getByRole("img", { name: "Atlántico: 0" })
    ).toBeInTheDocument()
  })
})
