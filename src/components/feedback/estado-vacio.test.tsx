import { render, screen } from "@testing-library/react"
import { Megaphone } from "lucide-react"
import { describe, expect, it } from "vitest"

import { EstadoVacio } from "./estado-vacio"

describe("EstadoVacio", () => {
  it("muestra título, descripción y acciones", () => {
    render(
      <EstadoVacio
        icono={Megaphone}
        titulo="Aún no hay campañas"
        descripcion="Crea la primera para empezar a recibir ofertas."
      >
        <button type="button">Crear campaña</button>
      </EstadoVacio>
    )

    expect(screen.getByText("Aún no hay campañas")).toBeInTheDocument()
    expect(
      screen.getByText("Crea la primera para empezar a recibir ofertas.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Crear campaña" })
    ).toBeInTheDocument()
  })
})
