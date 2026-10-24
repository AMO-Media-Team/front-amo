import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Sin el enrutador de Next: el enlace solo avisa del clic.
vi.mock("next/link", () => ({
  default: ({
    href,
    scroll: _scroll,
    ...props
  }: ComponentProps<"a"> & { href: string; scroll?: boolean }) => (
    <a
      href={href}
      {...props}
      onClick={(evento) => {
        evento.preventDefault()
        props.onClick?.(evento)
      }}
    />
  ),
}))

import { ID_TITULO_COLA, rutaCola } from "../colas"
import {
  EnlacePaginaCola,
  FocoTrasPaginar,
  marcarPaginacion,
} from "./foco-paginacion"

/** La cola: su título (destino del foco) y, si ya llegó, la lista nueva. */
function Cola({ lista = false }: { lista?: boolean }) {
  return (
    <section>
      <h2 id={ID_TITULO_COLA} tabIndex={-1}>
        Evidencias
      </h2>
      {lista ? <FocoTrasPaginar /> : null}
      <EnlacePaginaCola href={rutaCola("evidencias", { pagina: 2 })}>
        Siguientes
      </EnlacePaginaCola>
    </section>
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe("FocoTrasPaginar (U4)", () => {
  it("tras «Siguientes», la lista nueva lleva el foco al título de la cola", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Cola />)
    const enlace = screen.getByRole("link", { name: "Siguientes" })
    expect(enlace).toHaveAttribute(
      "href",
      "/operacion/validacion?cola=evidencias&pagina=2"
    )
    await usuario.click(enlace)
    // La lista anterior (con el enlace enfocado) se desmonta y llega la nueva.
    rerender(<Cola lista />)
    expect(screen.getByRole("heading", { name: "Evidencias" })).toHaveFocus()
  })

  it("sin paginar (otra cola, el filtro, volver atrás) no mueve el foco", () => {
    render(<Cola lista />)
    expect(
      screen.getByRole("heading", { name: "Evidencias" })
    ).not.toHaveFocus()
  })

  it("una paginación que no llegó no mueve el foco la próxima vez", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-23T15:00:00Z"))
    marcarPaginacion()
    vi.setSystemTime(new Date("2026-10-23T15:05:00Z"))
    render(<Cola lista />)
    expect(
      screen.getByRole("heading", { name: "Evidencias" })
    ).not.toHaveFocus()
  })
})
