import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  suspenderAnunciante: vi.fn(),
  reactivarAnunciante: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { AccionesEstadoAnunciante } from "./acciones-estado"

const EMPRESA = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa",
  nombreComercial: "Café del Sur",
}

beforeEach(() => {
  acciones.suspenderAnunciante.mockReset().mockResolvedValue(exito())
  acciones.reactivarAnunciante.mockReset().mockResolvedValue(exito())
})

describe("AccionesEstadoAnunciante", () => {
  it("sin acciones permitidas no pinta nada", () => {
    const { container } = render(
      <AccionesEstadoAnunciante anunciante={EMPRESA} acciones={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("suspender exige un motivo, lo envía y cierra el diálogo", async () => {
    const usuario = userEvent.setup()
    render(
      <AccionesEstadoAnunciante anunciante={EMPRESA} acciones={["suspender"]} />
    )
    expect(
      screen.queryByRole("button", { name: "Reactivar" })
    ).not.toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Suspender a Café del Sur?",
    })
    expect(dialogo).toHaveTextContent(/no podrá enviar ofertas a revisión/)

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender empresa" })
    )
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Describe el motivo (al menos 5 caracteres)."
    )
    await usuario.type(
      within(dialogo).getByLabelText("Motivo"),
      "Facturas vencidas sin pagar"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender empresa" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(acciones.suspenderAnunciante).toHaveBeenCalledWith({
      anuncianteId: EMPRESA.id,
      motivo: "Facturas vencidas sin pagar",
    })
  })

  it("tras suspender, el foco queda en el mismo botón, ahora «Reactivar»", async () => {
    const usuario = userEvent.setup()
    const vista = render(
      <AccionesEstadoAnunciante anunciante={EMPRESA} acciones={["suspender"]} />
    )
    // Como la Server Action: la cabecera se refresca antes de cerrar el diálogo.
    acciones.suspenderAnunciante.mockImplementation(async () => {
      vista.rerender(
        <AccionesEstadoAnunciante
          anunciante={EMPRESA}
          acciones={["reactivar"]}
        />
      )
      return exito()
    })
    const boton = screen.getByRole("button", { name: "Suspender" })
    await usuario.click(boton)
    const dialogo = screen.getByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo"),
      "Facturas vencidas sin pagar"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender empresa" })
    )
    const reactivar = await screen.findByRole("button", { name: "Reactivar" })
    expect(reactivar).toBe(boton)
    await waitFor(() => expect(reactivar).toHaveFocus())
  })

  it("un fallo de la BD se muestra dentro del diálogo de reactivación", async () => {
    acciones.reactivarAnunciante.mockResolvedValue(
      fallo("No tienes permiso para esta acción.")
    )
    const usuario = userEvent.setup()
    render(
      <AccionesEstadoAnunciante anunciante={EMPRESA} acciones={["reactivar"]} />
    )
    await usuario.click(screen.getByRole("button", { name: "Reactivar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Reactivar a Café del Sur?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Se resolvió el motivo de la suspensión.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reactivar empresa" })
    )
    expect(
      await within(dialogo).findByText("No tienes permiso para esta acción.")
    ).toBeInTheDocument()
    expect(acciones.reactivarAnunciante).toHaveBeenCalledWith({
      anuncianteId: EMPRESA.id,
      motivo: "Se resolvió el motivo de la suspensión.",
    })
  })
})
