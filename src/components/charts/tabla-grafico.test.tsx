import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { nombreRegionTabla, TablaGrafico } from "./tabla-grafico"
import type { TablaGrafico as DatosTabla } from "./tipos"

const DATOS: DatosTabla = {
  columnas: [
    { titulo: "Mes", numerica: false },
    { titulo: "GMV", numerica: true },
  ],
  filas: [
    ["jul", "$ 100"],
    ["ago", "$ 250"],
  ],
}

describe("TablaGrafico", () => {
  it("la tabla visible es una región con nombre que se enfoca con Tab (DSH-002)", async () => {
    const usuario = userEvent.setup()
    render(<TablaGrafico tabla={DATOS} titulo="GMV mensual" />)

    const region = screen.getByRole("region", {
      name: nombreRegionTabla("GMV mensual"),
    })
    expect(region).toHaveAttribute("tabindex", "0")
    await usuario.tab()
    expect(region).toHaveFocus()
    expect(
      screen.getByRole("table", { name: "GMV mensual" })
    ).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: "ago" })).toBeInTheDocument()
  })

  it("la oculta (junto al lienzo) no es región ni recibe el foco", () => {
    render(<TablaGrafico tabla={DATOS} titulo="GMV mensual" oculta />)

    expect(screen.queryByRole("region")).not.toBeInTheDocument()
    expect(
      screen.getByRole("table", { name: "GMV mensual" })
    ).toBeInTheDocument()
    expect(document.querySelector("[tabindex]")).toBeNull()
  })
})
