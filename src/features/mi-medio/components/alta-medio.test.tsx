import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { medioFijo, resumenCompleto, resumenFijo } from "../fixtures"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ enviarMedioAVerificacion: vi.fn() }))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { AltaMedio } from "./alta-medio"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AltaMedio · medio recién registrado", () => {
  it("lista los cinco pasos con su avance y a dónde lleva cada uno", () => {
    render(<AltaMedio resumen={resumenFijo()} />)
    expect(
      screen.getByRole("heading", { name: "Completa el alta de tu medio" })
    ).toBeInTheDocument()

    const lista = screen.getByRole("region", { name: "Lista de alta" })
    expect(within(lista).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1"
    )
    const enlaces = within(lista)
      .getAllByRole("link")
      .map((enlace) => enlace.getAttribute("href"))
    expect(enlaces).toEqual([
      "/mi-medio/perfil",
      "/mi-medio/documentos",
      "/mi-medio/pago",
      "/mi-medio/cuentas",
    ])
  })

  it("no deja enviar y dice qué falta", () => {
    render(<AltaMedio resumen={resumenFijo()} />)
    const boton = screen.getByRole("button", { name: "Enviar a verificación" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(
      "Para enviar a verificación completa tu perfil, tus documentos, tus datos de pago y tus cuentas sociales."
    )
  })
})

describe("AltaMedio · envío a verificación", () => {
  it("con todo listo confirma y envía", async () => {
    const usuario = userEvent.setup()
    acciones.enviarMedioAVerificacion.mockResolvedValue(exito())
    render(<AltaMedio resumen={resumenCompleto()} />)

    expect(
      screen.getByRole("heading", { name: "Todo listo para enviar" })
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a verificación" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a verificación" })
    )

    await waitFor(() =>
      expect(acciones.enviarMedioAVerificacion).toHaveBeenCalledTimes(1)
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Tu medio quedó en revisión",
      expect.anything()
    )
  })

  it("si la BD dice que falta algo, lo muestra en el diálogo", async () => {
    const usuario = userEvent.setup()
    acciones.enviarMedioAVerificacion.mockResolvedValue(
      fallo("Antes de enviar completa: una cuenta social.")
    )
    render(<AltaMedio resumen={resumenCompleto()} />)

    await usuario.click(
      screen.getByRole("button", { name: "Enviar a verificación" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a verificación" })
    )
    expect(
      await within(dialogo).findByText(
        "Antes de enviar completa: una cuenta social."
      )
    ).toBeInTheDocument()
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("tras un rechazo muestra el motivo y ofrece volver a enviar", () => {
    render(
      <AltaMedio
        resumen={resumenCompleto({
          medio: medioFijo({
            estado: "RECHAZADO",
            motivoEstado: "La foto de la cédula está borrosa.",
          }),
        })}
      />
    )
    expect(
      screen.getByText("La foto de la cédula está borrosa.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Volver a enviar" })
    ).toBeInTheDocument()
  })
})

describe("AltaMedio · después del alta", () => {
  it("en revisión no ofrece enviar de nuevo", () => {
    render(
      <AltaMedio
        resumen={resumenCompleto({
          medio: medioFijo({ enviadoVerificacionAt: "2026-10-21T15:00:00Z" }),
        })}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Tu medio está en revisión" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull()
  })

  it("verificado muestra su nivel y la información al día", () => {
    render(
      <AltaMedio
        resumen={resumenCompleto({
          medio: medioFijo({ estado: "VERIFICADO", nivel: 1 }),
        })}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Tu medio está verificado" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Tu información" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).toBeNull()
    expect(
      screen.getByRole("link", { name: /Ver mi nivel y cómo subir/ })
    ).toHaveAttribute("href", "/mi-medio/nivel")
    expect(
      screen.getByRole("link", { name: /Ver mi reputación/ })
    ).toHaveAttribute("href", "/mi-medio/reputacion")
  })

  it("durante el alta aún no ofrece la reputación", () => {
    render(<AltaMedio resumen={resumenFijo()} />)
    expect(screen.queryByRole("link", { name: /Ver mi reputación/ })).toBeNull()
  })
})
