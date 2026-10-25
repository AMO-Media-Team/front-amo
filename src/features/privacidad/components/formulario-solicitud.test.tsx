import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  radicarSolicitud: vi.fn(),
  aportarInformacion: vi.fn(),
  desistirSolicitud: vi.fn(),
  firmarSoportePropio: vi.fn(),
  firmarSoporteInterno: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { FormularioSolicitud } from "./formulario-solicitud"

const SOLICITUD = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"

beforeEach(() => {
  for (const accion of Object.values(acciones)) accion.mockReset()
  acciones.radicarSolicitud.mockResolvedValue(
    exito({ solicitudId: SOLICITUD, numero: 41, plazoVence: "2026-11-17" })
  )
})

describe("FormularioSolicitud", () => {
  it("explica cada derecho con su plazo legal", () => {
    render(<FormularioSolicitud rol="MEDIO" abiertas={[]} />)
    const grupo = screen.getByRole("radiogroup", {
      name: "¿Qué quieres pedir?",
    })
    expect(within(grupo).getAllByRole("radio")).toHaveLength(6)
    expect(
      within(grupo).getByRole("radio", { name: "Suprimir mis datos" })
    ).toHaveAccessibleDescription(/máximo 15 días hábiles/)
    expect(
      within(grupo).getByRole("radio", { name: "Consultar mis datos" })
    ).toHaveAccessibleDescription(/máximo 10 días hábiles/)
  })

  it("los datos de pago y documentos solo se ofrecen al medio", () => {
    const { rerender } = render(
      <FormularioSolicitud rol="MEDIO" abiertas={[]} />
    )
    expect(screen.getByRole("checkbox", { name: "Pago" })).toBeInTheDocument()
    rerender(<FormularioSolicitud rol="ANUNCIANTE" abiertas={[]} />)
    expect(screen.queryByRole("checkbox", { name: "Pago" })).toBeNull()
  })

  it("valida antes de enviar y lleva el foco al primer error", async () => {
    const usuario = userEvent.setup()
    render(<FormularioSolicitud rol="MEDIO" abiertas={[]} />)
    await usuario.click(
      screen.getByRole("button", { name: "Radicar solicitud" })
    )
    expect(acciones.radicarSolicitud).not.toHaveBeenCalled()
    expect(screen.getByText("Elige qué quieres pedir.")).toBeInTheDocument()
    expect(screen.getByText("Cuéntanos qué necesitas.")).toBeInTheDocument()
  })

  it("una supresión advierte que se borra la cuenta", async () => {
    const usuario = userEvent.setup()
    render(<FormularioSolicitud rol="MEDIO" abiertas={[]} />)
    await usuario.click(
      screen.getByRole("radio", { name: "Suprimir mis datos" })
    )
    expect(
      screen.getByText(/borraremos tu cuenta y ya no podrás ingresar/)
    ).toBeInTheDocument()
  })

  it("no deja radicar un tipo que ya tiene una abierta", () => {
    render(<FormularioSolicitud rol="MEDIO" abiertas={["SUPRESION"]} />)
    const opcion = screen.getByRole("radio", { name: "Suprimir mis datos" })
    expect(opcion).toHaveAttribute("data-disabled")
    expect(opcion).toHaveAccessibleDescription(/Ya tienes una en trámite/)
  })

  it("radica y confirma con el número y la fecha límite", async () => {
    const usuario = userEvent.setup()
    render(<FormularioSolicitud rol="MEDIO" abiertas={[]} />)
    await usuario.click(
      screen.getByRole("radio", { name: "Suprimir mis datos" })
    )
    await usuario.type(
      screen.getByLabelText("Cuéntanos qué necesitas"),
      "Quiero que borren mi cuenta y mis datos."
    )
    await usuario.click(screen.getByRole("checkbox", { name: "Contacto" }))
    await usuario.click(
      screen.getByRole("button", { name: "Radicar solicitud" })
    )

    expect(acciones.radicarSolicitud).toHaveBeenCalledWith({
      tipo: "SUPRESION",
      descripcion: "Quiero que borren mi cuenta y mis datos.",
      datosAfectados: ["CONTACTO"],
    })
    const confirmacion = await screen.findByRole("status")
    expect(confirmacion).toHaveTextContent("Radicamos tu solicitud N.º 41")
    expect(confirmacion).toHaveTextContent("17 de noviembre de 2026")
    expect(confirmacion).toHaveFocus()
    expect(
      within(confirmacion).getByRole("link", { name: "Ver la solicitud" })
    ).toHaveAttribute("href", `#solicitud-${SOLICITUD}`)
  })

  it("muestra el error de la BD sin perder lo escrito", async () => {
    acciones.radicarSolicitud.mockResolvedValue(
      fallo("Ya tienes una solicitud de este tipo en trámite.")
    )
    const usuario = userEvent.setup()
    render(<FormularioSolicitud rol="ANUNCIANTE" abiertas={[]} />)
    await usuario.click(
      screen.getByRole("radio", { name: "Consultar mis datos" })
    )
    await usuario.type(
      screen.getByLabelText("Cuéntanos qué necesitas"),
      "Quiero saber qué datos tienen de mí."
    )
    await usuario.click(
      screen.getByRole("button", { name: "Radicar solicitud" })
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya tienes una solicitud de este tipo en trámite."
    )
    expect(screen.getByLabelText("Cuéntanos qué necesitas")).toHaveValue(
      "Quiero saber qué datos tienen de mí."
    )
  })
})
