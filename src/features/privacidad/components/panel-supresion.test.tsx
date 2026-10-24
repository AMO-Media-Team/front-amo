import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { ResultadoSupresion } from "../tipos"

const acciones = vi.hoisted(() => ({
  simularSupresion: vi.fn(),
  ejecutarSupresion: vi.fn(),
  reintentarBorradoArchivos: vi.fn(),
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
    medioId: null,
    contactoEmpresa: "NINGUNO",
    solicitudesVinculacion: 1,
    archivos: [{ bucket: "avatares", prefijo: "perfil/x/" }],
    archivosPendientes: null,
    archivosRevisadosAt: null,
    seConserva: ["La bitácora de auditoría, con el correo enmascarado."],
    simulacion: true,
    ...cambios,
  }
}

beforeEach(() => {
  acciones.simularSupresion.mockReset().mockResolvedValue(exito(resultado()))
  acciones.ejecutarSupresion.mockReset().mockResolvedValue(
    exito({
      resultado: resultado({ simulacion: false, archivosPendientes: [] }),
      archivosBorrados: 3,
      archivosPendientes: 0,
      archivosRechazados: 0,
    })
  )
  acciones.reintentarBorradoArchivos.mockReset().mockResolvedValue(
    exito({
      archivosBorrados: 2,
      archivosPendientes: 0,
      archivosRechazados: 0,
    })
  )
})

/** El aviso del estado de la ficha (destino del foco tras ejecutar). */
function Aviso() {
  return (
    <div id="estado-solicitud" tabIndex={-1}>
      Respondida: procede
    </div>
  )
}

async function ejecutar(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.click(screen.getByRole("button", { name: "Simular supresión" }))
  await screen.findByText("Simulación: todavía no se borró nada")
  await usuario.click(
    screen.getByRole("button", { name: "Ejecutar supresión" })
  )
  const dialogo = await screen.findByRole("alertdialog")
  await usuario.type(
    within(dialogo).getByLabelText(/Escribe\s*41\s*para confirmar/),
    "41"
  )
  await usuario.click(
    within(dialogo).getByRole("button", { name: "Ejecutar supresión" })
  )
}

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

  it("separa un deber legal de quién puede suprimir la cuenta", async () => {
    acciones.simularSupresion.mockResolvedValue(
      exito(
        resultado({
          bloqueos: [
            "El medio tiene disputas abiertas.",
            "Solo un superadministrador puede suprimir esta cuenta.",
          ],
        })
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
      await screen.findByText("No procede por un deber legal o contractual")
    ).toBeInTheDocument()
    expect(
      screen.getByText("No se puede ejecutar desde tu cuenta")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Solo un superadministrador puede suprimir esta cuenta.")
    ).toBeInTheDocument()
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
      await screen.findByText("3 archivos borrados de Storage.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Reintentar el borrado/ })
    ).toBeNull()
  })

  it("la simulación dice qué solicitudes de vinculación se borran", async () => {
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
      await screen.findByText(/^Se borra 1 solicitud del formulario/)
    ).toBeInTheDocument()
  })

  it("al cancelar la ejecución el foco vuelve al botón; al ejecutarla, al aviso del estado", async () => {
    const usuario = userEvent.setup()
    render(
      <>
        <Aviso />
        <PanelSupresion
          solicitud={SOLICITUD}
          puedeSimular
          puedeEjecutar
          ejecutada={null}
          actorEsTitular={false}
        />
      </>
    )
    await usuario.click(
      screen.getByRole("button", { name: "Simular supresión" })
    )
    await screen.findByText("Simulación: todavía no se borró nada")
    const boton = screen.getByRole("button", { name: "Ejecutar supresión" })
    await usuario.click(boton)
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(boton).toHaveFocus()

    await usuario.click(boton)
    const otra = await screen.findByRole("alertdialog")
    await usuario.type(
      within(otra).getByLabelText(/Escribe\s*41\s*para confirmar/),
      "41"
    )
    await usuario.click(
      within(otra).getByRole("button", { name: "Ejecutar supresión" })
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() =>
      expect(document.getElementById("estado-solicitud")).toHaveFocus()
    )
  })

  it("lo que Storage no borró se puede reintentar; nunca promete una limpieza programada", async () => {
    acciones.ejecutarSupresion.mockResolvedValue(
      exito({
        resultado: resultado({
          simulacion: false,
          archivosPendientes: [{ bucket: "avatares", prefijo: "perfil/x/" }],
        }),
        archivosBorrados: 1,
        archivosPendientes: 2,
        archivosRechazados: 0,
      })
    )
    const usuario = userEvent.setup()
    render(
      <>
        <Aviso />
        <PanelSupresion
          solicitud={SOLICITUD}
          puedeSimular
          puedeEjecutar
          ejecutada={null}
          actorEsTitular={false}
        />
      </>
    )
    await ejecutar(usuario)
    expect(
      await screen.findByText(
        "1 archivo borrado de Storage. 2 carpetas o archivos siguen ahí: reintenta el borrado."
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/limpieza/)).toBeNull()

    await usuario.click(
      screen.getByRole("button", { name: "Reintentar el borrado de archivos" })
    )
    expect(acciones.reintentarBorradoArchivos).toHaveBeenCalledWith({
      solicitudId: SOLICITUD.id,
    })
    expect(
      await screen.findByText(
        "Reintento del borrado: 2 archivos borrados de Storage."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("Se borraron de Storage.")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Reintentar el borrado/ })
    ).toBeNull()
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus())
  })

  it("una supresión ya ejecutada muestra los pendientes que guardó la BD", () => {
    render(
      <PanelSupresion
        solicitud={SOLICITUD}
        puedeSimular={false}
        puedeEjecutar={false}
        ejecutada={{
          at: "2026-10-24T15:00:00Z",
          resultado: resultado({
            simulacion: false,
            archivosPendientes: [{ bucket: "avatares", prefijo: "perfil/x/" }],
          }),
        }}
        actorEsTitular={false}
      />
    )
    expect(
      screen.getByText(
        "1 carpeta o archivo sigue en Storage: reintenta el borrado."
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Reintentar el borrado de archivos" })
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
