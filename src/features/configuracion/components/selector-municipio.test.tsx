import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { OpcionMunicipio } from "../queries"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ buscarMunicipios: vi.fn() }))
vi.mock("../actions", () => acciones)

import { SelectorMunicipio } from "./selector-municipio"

const BOGOTA: OpcionMunicipio = {
  codigo: "11001",
  nombre: "Bogotá, D.C.",
  departamento: "Bogotá",
}

// La lista de `cmdk` mide su contenido y lleva a la vista el elemento activo.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  acciones.buscarMunicipios.mockReset()
  acciones.buscarMunicipios.mockResolvedValue(exito([BOGOTA]))
})

describe("SelectorMunicipio", () => {
  it("con la lista abierta, aria-controls apunta al listbox que existe", async () => {
    const usuario = userEvent.setup()
    render(<SelectorMunicipio valor="" etiqueta={null} onCambio={vi.fn()} />)
    const disparador = screen.getByRole("combobox")
    expect(disparador).not.toHaveAttribute("aria-controls")

    await usuario.click(disparador)
    await screen.findByRole("option", { name: /Bogotá, D\.C\./ })
    const lista = screen.getByRole("listbox")
    // cmdk pone su propio id a la lista: el disparador debe usar ese.
    expect(lista.id).not.toBe("")
    expect(disparador).toHaveAttribute("aria-controls", lista.id)

    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(disparador).not.toHaveAttribute("aria-controls"))
  })

  it("entrega el municipio elegido", async () => {
    const usuario = userEvent.setup()
    const onCambio = vi.fn()
    render(<SelectorMunicipio valor="" etiqueta={null} onCambio={onCambio} />)

    await usuario.click(screen.getByRole("combobox"))
    await usuario.click(
      await screen.findByRole("option", { name: /Bogotá, D\.C\./ })
    )

    expect(onCambio).toHaveBeenCalledWith(BOGOTA)
  })
})
