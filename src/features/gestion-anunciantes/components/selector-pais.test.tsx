import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { OpcionPais } from "../tipos"
import { SelectorPais } from "./selector-pais"

const PAISES: OpcionPais[] = [
  { iso2: "CO", nombre: "Colombia" },
  { iso2: "EC", nombre: "Ecuador" },
  { iso2: "PE", nombre: "Perú" },
]

// La lista de `cmdk` mide su contenido y lleva a la vista el elemento activo.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

describe("SelectorPais", () => {
  it("con la lista abierta, aria-controls apunta al listbox que existe", async () => {
    const usuario = userEvent.setup()
    render(<SelectorPais valor="CO" paises={PAISES} onCambio={vi.fn()} />)
    const disparador = screen.getByRole("combobox")
    expect(disparador).toHaveAttribute("aria-expanded", "false")
    expect(disparador).not.toHaveAttribute("aria-controls")

    await usuario.click(disparador)
    const lista = await screen.findByRole("listbox")
    // cmdk pone su propio id a la lista: el disparador debe usar ese.
    expect(lista.id).not.toBe("")
    expect(disparador).toHaveAttribute("aria-controls", lista.id)

    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(disparador).not.toHaveAttribute("aria-controls"))
  })

  it("entrega el país elegido", async () => {
    const usuario = userEvent.setup()
    const onCambio = vi.fn()
    render(<SelectorPais valor="CO" paises={PAISES} onCambio={onCambio} />)

    await usuario.click(screen.getByRole("combobox"))
    await usuario.click(await screen.findByRole("option", { name: /Perú/ }))

    expect(onCambio).toHaveBeenCalledWith("PE")
  })
})
