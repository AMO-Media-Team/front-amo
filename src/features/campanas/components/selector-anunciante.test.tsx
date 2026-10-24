import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { OpcionAnuncianteGestion } from "../gestion"
import { SelectorAnunciante } from "./selector-anunciante"

const ANUNCIANTES: OpcionAnuncianteGestion[] = [
  {
    id: "0199f3a0-0000-7000-8000-00000000a001",
    nombre: "Café Sierra Alta",
    estado: "VERIFICADO",
  },
  {
    id: "0199f3a0-0000-7000-8000-00000000a002",
    nombre: "Jugos del Valle",
    estado: "PENDIENTE",
  },
]

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

describe("SelectorAnunciante", () => {
  it("con la lista abierta, aria-controls apunta al listbox que existe", async () => {
    const usuario = userEvent.setup()
    render(
      <SelectorAnunciante
        id="empresa"
        valor=""
        opciones={ANUNCIANTES}
        onCambio={vi.fn()}
      />
    )
    const disparador = screen.getByRole("combobox")
    expect(disparador).toHaveTextContent("Elige el anunciante")
    // Cerrado no controla nada.
    expect(disparador).not.toHaveAttribute("aria-controls")

    await usuario.click(disparador)
    const lista = await screen.findByRole("listbox")
    expect(disparador).toHaveAttribute("aria-expanded", "true")
    expect(disparador).toHaveAttribute("aria-controls", lista.id)
    expect(lista.id).not.toBe("")
    expect(document.getElementById(lista.id)).toBe(lista)
  })

  it("elige con la lista y la cierra; cerrada, ya no hay aria-controls", async () => {
    const usuario = userEvent.setup()
    const onCambio = vi.fn()
    render(
      <SelectorAnunciante valor="" opciones={ANUNCIANTES} onCambio={onCambio} />
    )
    const disparador = screen.getByRole("combobox")
    await usuario.click(disparador)
    await usuario.click(
      await screen.findByRole("option", { name: /Jugos del Valle/ })
    )
    expect(onCambio).toHaveBeenCalledWith(ANUNCIANTES[1].id)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(disparador).not.toHaveAttribute("aria-controls")
  })

  it("la ref llega al disparador (el formulario lleva ahí el foco)", () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <SelectorAnunciante
        ref={ref}
        valor={ANUNCIANTES[0].id}
        opciones={ANUNCIANTES}
        onCambio={vi.fn()}
      />
    )
    expect(ref.current).toBe(screen.getByRole("combobox"))
    ref.current?.focus()
    expect(screen.getByRole("combobox")).toHaveFocus()
  })
})
