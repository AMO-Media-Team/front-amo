import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { CONTACTO_DESACTUALIZADO } from "../errores"
import type { ContactoEmpresa } from "../tipos"

const acciones = vi.hoisted(() => ({ guardarContactoEmpresa: vi.fn() }))
vi.mock("../actions", () => acciones)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { FormularioContacto } from "./formulario-contacto"

const VACIO: ContactoEmpresa = {
  nombre: null,
  email: null,
  celular: null,
  direccion: null,
  actualizadoAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("FormularioContacto", () => {
  it("pide nombre y correo, con el teclado adecuado en el celular", async () => {
    const usuario = userEvent.setup()
    render(<FormularioContacto contacto={VACIO} />)
    expect(screen.getByLabelText("Correo")).toHaveAttribute("type", "email")
    expect(screen.getByLabelText(/^Celular/)).toHaveAttribute("type", "tel")

    await usuario.type(screen.getByLabelText(/^Dirección/), "Calle 93")
    await usuario.click(
      screen.getByRole("button", { name: "Guardar contacto" })
    )
    expect(
      await screen.findByText(
        "Escribe el nombre de la persona de contacto (al menos 2 caracteres)."
      )
    ).toBeVisible()
    expect(
      screen.getByText("Escribe el correo de la persona de contacto.")
    ).toBeVisible()
    expect(screen.getByLabelText("Nombre completo")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(acciones.guardarContactoEmpresa).not.toHaveBeenCalled()
  })

  it("guarda lo escrito con la versión y confirma", async () => {
    const usuario = userEvent.setup()
    acciones.guardarContactoEmpresa.mockResolvedValue(
      exito({ actualizadoAt: "v2" })
    )
    render(
      <FormularioContacto
        contacto={{
          ...VACIO,
          nombre: "Laura",
          email: "laura@andina.co",
          actualizadoAt: "v1",
        }}
      />
    )
    await usuario.type(screen.getByLabelText(/^Celular/), "300 123 4567")
    await usuario.click(
      screen.getByRole("button", { name: "Guardar contacto" })
    )
    await waitFor(() =>
      expect(acciones.guardarContactoEmpresa).toHaveBeenCalledWith({
        nombre: "Laura",
        correo: "laura@andina.co",
        celular: "300 123 4567",
        direccion: "",
        version: "v1",
      })
    )
    expect(avisos.success).toHaveBeenCalledWith("Persona de contacto guardada")
  })

  it("si otra persona lo cambió, ofrece cargar lo vigente", async () => {
    const usuario = userEvent.setup()
    acciones.guardarContactoEmpresa.mockResolvedValue(
      fallo(CONTACTO_DESACTUALIZADO)
    )
    render(
      <FormularioContacto
        contacto={{
          ...VACIO,
          nombre: "Laura",
          email: "laura@andina.co",
          actualizadoAt: "v1",
        }}
      />
    )
    await usuario.type(screen.getByLabelText("Nombre completo"), " Gómez")
    await usuario.click(
      screen.getByRole("button", { name: "Guardar contacto" })
    )
    await usuario.click(
      await screen.findByRole("button", { name: "Cargar los datos vigentes" })
    )
    expect(enrutador.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Laura")
  })
})
