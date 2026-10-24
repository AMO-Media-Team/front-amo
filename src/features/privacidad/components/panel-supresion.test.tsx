import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { ResultadoSupresion } from "../tipos"

const acciones = vi.hoisted(() => ({
  simularSupresion: vi.fn(),
  ejecutarSupresion: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { PanelSupresion } from "./panel-supresion"

const SOLICITUD = { id: "0192f3a4-5b6c-7d8e-9f01-0000000000a1", numero: 41 }

function resultado(
  cambios: Partial<ResultadoSupresion> = {}
): ResultadoSupresion {
  return {
    solicitud: 41,
    bloqueos: [],
    cuenta: "BORRAR",
    medio: "BORRAR",
    contactoEmpresa: "NINGUNO",
    archivos: [{ bucket: "avatares", prefijo: "perfil/x/" }],
    seConserva: ["La bitácora de auditoría, con el correo enmascarado."],
    simulacion: true,
    ...cambios,
  }
}

beforeEach(() => {
  acciones.simularSupresion.mockReset().mockResolvedValue(exito(resultado()))
  acciones.ejecutarSupresion.mockReset().mockResolvedValue(
    exito({
      resultado: resultado({ simulacion: false }),
      archivosBorrados: 3,
      archivosPendientes: 0,
    })
  )
})

describe("PanelSupresion", () => {
  it("ejecutar exige simular antes", () => {
    render(
      <PanelSupresion
        solicitud={SOLICITUD}
        puedeSimular
        puedeEjecutar
        ejecutada={null}
        actorEsTitular={false}
      />
    )
    expect(
      screen.getByRole("button", { name: "Ejecutar supresión" })
    ).toHaveAttribute("data-disabled")
    expect(
      screen.getByRole("button", { name: "Ejecutar supresión" })
    ).toHaveAccessibleDescription("Simula la supresión antes de ejecutarla.")
  })

  it("con bloqueos la simulación los muestra y no deja ejecutar", async () => {
    acciones.simularSupresion.mockResolvedValue(
      exito(
        resultado({ bloqueos: ["El medio tiene liquidaciones sin pagar."] })
      )
    )
    const usuario = userEvent.setup()
    render(
      <PanelSupresion
        solicitud={SOLICITUD}
        puedeSimular
        puedeEjecutar
        ejecutada={null}
        actorEsTitular={false}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Simular supresión" })
    )
    expect(
      await screen.findByText("El medio tiene liquidaciones sin pagar.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Ejecutar supresión" })
    ).toHaveAttribute("data-disabled")
  })

  it("sin bloqueos se ejecuta escribiendo el radicado", async () => {
    const usuario = userEvent.setup()
    render(
      <PanelSupresion
        solicitud={SOLICITUD}
        puedeSimular
        puedeEjecutar
        ejecutada={null}
        actorEsTitular={false}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Simular supresión" })
    )
    expect(
      await screen.findByText("Simulación: todavía no se borró nada")
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Ejecutar supresión" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    const confirmar = within(dialogo).getByRole("button", {
      name: "Ejecutar supresión",
    })
    expect(confirmar).toBeDisabled()
    await usuario.type(
      within(dialogo).getByLabelText(/Escribe\s*41\s*para confirmar/),
      "41"
    )
    await usuario.click(confirmar)
    expect(acciones.ejecutarSupresion).toHaveBeenCalledWith({
      solicitudId: SOLICITUD.id,
      radicado: "41",
    })
    expect(
      await screen.findByText("3 borrados de Storage.")
    ).toBeInTheDocument()
  })

  it("el titular no ejecuta la supresión de sus propios datos", () => {
    render(
      <PanelSupresion
        solicitud={SOLICITUD}
        puedeSimular={false}
        puedeEjecutar={false}
        ejecutada={null}
        actorEsTitular
      />
    )
    expect(
      screen.getByText(/otra persona del equipo ejecuta la supresión/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
