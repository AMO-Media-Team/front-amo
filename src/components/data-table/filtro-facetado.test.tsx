import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { type FiltroFacetado, FiltroFacetadoTabla } from "./filtro-facetado"

const FILTRO: FiltroFacetado = {
  clave: "estado",
  titulo: "Estado",
  opciones: [
    { valor: "ACTIVO", etiqueta: "Activo" },
    { valor: "SUSPENDIDO", etiqueta: "Suspendido" },
  ],
}

beforeAll(() => {
  // jsdom no implementa ResizeObserver ni scrollIntoView (los usa cmdk).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

describe("FiltroFacetadoTabla", () => {
  it("expone lo aplicado con aria-checked y un texto oculto (cmdk pisa aria-selected)", async () => {
    const usuario = userEvent.setup()
    const onCambiar = vi.fn()
    render(
      <FiltroFacetadoTabla
        filtro={FILTRO}
        seleccionados={["ACTIVO"]}
        onCambiar={onCambiar}
      />
    )

    await usuario.click(screen.getByRole("button", { name: /Estado/ }))

    const lista = await screen.findByRole("listbox", { name: "Resultados" })
    expect(lista).toBeInTheDocument()
    const activo = screen.getByRole("option", { name: "Activo, aplicado" })
    expect(activo).toHaveAttribute("aria-checked", "true")
    const suspendido = screen.getByRole("option", { name: "Suspendido" })
    expect(suspendido).toHaveAttribute("aria-checked", "false")

    await usuario.click(suspendido)
    expect(onCambiar).toHaveBeenCalledWith(["ACTIVO", "SUSPENDIDO"])
  })
})
