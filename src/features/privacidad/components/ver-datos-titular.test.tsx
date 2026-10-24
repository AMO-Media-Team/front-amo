import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

const acciones = vi.hoisted(() => ({ consultarDatosTitular: vi.fn() }))
vi.mock("../actions", () => acciones)
vi.mock("./descarga-datos", () => ({
  descargarDatosTitular: vi.fn(),
  NOMBRES_FORMATO: { json: "JSON", xlsx: "Excel" },
}))

import { VerDatosTitular } from "./ver-datos-titular"

const SOLICITUD = { id: "0192f3a4-5b6c-7d8e-9f01-0000000000a1", numero: 41 }

beforeEach(() => {
  acciones.consultarDatosTitular.mockReset().mockResolvedValue(
    exito({
      generado_at: "2026-10-24T13:37:04-05:00",
      perfil: { nombre: "Ana", correo: "ana@amo.test" },
      identificacion: null,
      medio: null,
      empresa: null,
      solicitudes_de_vinculacion: [{ medio: "Ana Noticias" }],
    })
  )
})

describe("VerDatosTitular", () => {
  it("con la solicitud cerrada no consulta y dice por qué", async () => {
    const usuario = userEvent.setup()
    render(
      <VerDatosTitular
        solicitud={SOLICITUD}
        titular="Ana"
        disponible={false}
        veReservados
      />
    )
    const boton = screen.getByRole("button", { name: "Ver datos del titular" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(
      /solo mientras la solicitud está abierta/
    )
    await usuario.click(boton)
    expect(acciones.consultarDatosTitular).not.toHaveBeenCalled()
  })

  it("sin el permiso de datos sensibles avisa que la identificación y el pago no llegan", async () => {
    const usuario = userEvent.setup()
    render(
      <VerDatosTitular
        solicitud={SOLICITUD}
        titular="Ana"
        disponible
        veReservados={false}
      />
    )
    expect(
      screen.getByText(/Sin el permiso de datos sensibles no verás/)
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Ver datos del titular" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Datos del titular",
    })
    expect(dialogo).toHaveAccessibleDescription(/Tu rol no ve datos sensibles/)
    expect(
      within(dialogo).getByRole("region", { name: "Registros" })
    ).toHaveTextContent("Solicitudes de vinculación1")
  })
})
