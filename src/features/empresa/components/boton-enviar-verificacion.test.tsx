import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

const acciones = vi.hoisted(() => ({ enviarEmpresaAVerificacion: vi.fn() }))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { ID_SITUACION_VERIFICACION } from "../verificacion"
import { BotonEnviarVerificacion } from "./boton-enviar-verificacion"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("BotonEnviarVerificacion", () => {
  it("si falta algo, el botón sigue enfocable y dice qué falta", async () => {
    render(
      <BotonEnviarVerificacion
        faltantes={["los datos de la persona de contacto", "el RUT"]}
      />
    )
    const boton = screen.getByRole("button", { name: "Enviar a verificación" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(
      "Para enviar tu empresa a verificación aún necesitamos los datos de la persona de contacto y el RUT."
    )
    await userEvent.click(boton)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(acciones.enviarEmpresaAVerificacion).not.toHaveBeenCalled()
  })

  it("con todo listo confirma, envía y avisa", async () => {
    acciones.enviarEmpresaAVerificacion.mockResolvedValue(exito())
    render(<BotonEnviarVerificacion faltantes={[]} />)
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar a verificación" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Enviar tu empresa a verificación?",
    })
    expect(dialogo).toBeVisible()
    const botones = screen.getAllByRole("button", {
      name: "Enviar a verificación",
    })
    await userEvent.click(botones[botones.length - 1])
    expect(acciones.enviarEmpresaAVerificacion).toHaveBeenCalledTimes(1)
    expect(avisos.success).toHaveBeenCalledWith(
      "Tu empresa quedó en revisión",
      expect.anything()
    )
  })

  it("enviada, el foco va al titular que sigue en la página (el botón desaparece)", async () => {
    const usuario = userEvent.setup()
    const pagina = (conBoton: boolean) => (
      <section>
        <h2 id={ID_SITUACION_VERIFICACION} tabIndex={-1}>
          {conBoton ? "Todo listo para enviar" : "Tu empresa está en revisión"}
        </h2>
        {conBoton ? <BotonEnviarVerificacion faltantes={[]} /> : null}
      </section>
    )
    const vista = render(pagina(true))
    // Como la Server Action: la página se refresca (ya sin el botón) antes de
    // que la acción responda.
    acciones.enviarEmpresaAVerificacion.mockImplementation(async () => {
      vista.rerender(pagina(false))
      return exito()
    })
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a verificación" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a verificación" })
    )
    const titular = screen.getByRole("heading", {
      name: "Tu empresa está en revisión",
    })
    await waitFor(() => expect(titular).toHaveFocus())
  })

  it("tras un rechazo dice «Volver a enviar» y muestra el error de la BD en el diálogo", async () => {
    acciones.enviarEmpresaAVerificacion.mockResolvedValue(
      fallo("Antes de enviar carga: RUT.")
    )
    render(<BotonEnviarVerificacion faltantes={[]} reenvio />)
    await userEvent.click(
      screen.getByRole("button", { name: "Volver a enviar" })
    )
    await screen.findByRole("alertdialog", {
      name: "¿Volver a enviar tu empresa a verificación?",
    })
    const botones = screen.getAllByRole("button", { name: "Volver a enviar" })
    await userEvent.click(botones[botones.length - 1])
    expect(await screen.findByText("Antes de enviar carga: RUT.")).toBeVisible()
    expect(avisos.success).not.toHaveBeenCalled()
  })
})
