import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  activarCampana: vi.fn(),
  cancelarCampana: vi.fn(),
  archivarCampana: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
const enrutador = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))

import { AccionesCampana } from "./acciones-campana"

const CAMPANA = {
  id: "0199f3a0-0000-7000-8000-00000000ca01",
  nombre: "Temporada navideña",
  estado: "BORRADOR" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AccionesCampana", () => {
  it("con la empresa sin verificar, «Activar» queda deshabilitado, enfocable y explicado", async () => {
    render(
      <AccionesCampana
        campana={CAMPANA}
        puedeEditar
        acciones={[
          {
            accion: "activar",
            requiereMotivo: false,
            bloqueo: "Podrás activarla cuando AMO verifique tu empresa.",
          },
          { accion: "archivar", requiereMotivo: false, bloqueo: null },
        ]}
      />
    )
    const activar = screen.getByRole("button", { name: "Activar campaña" })
    expect(activar).toHaveAttribute("aria-disabled", "true")
    expect(activar).toHaveAccessibleDescription(
      "Podrás activarla cuando AMO verifique tu empresa."
    )
    await userEvent.setup().click(activar)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/campanas/${CAMPANA.id}/editar`
    )
  })

  it("activa tras confirmar y avisa", async () => {
    const usuario = userEvent.setup()
    acciones.activarCampana.mockResolvedValue(exito())
    render(
      <AccionesCampana
        campana={CAMPANA}
        puedeEditar
        acciones={[{ accion: "activar", requiereMotivo: false, bloqueo: null }]}
      />
    )
    await usuario.click(screen.getByRole("button", { name: "Activar campaña" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Activar la campaña?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Activar campaña" })
    )
    await waitFor(() =>
      expect(acciones.activarCampana).toHaveBeenCalledWith({
        campanaId: CAMPANA.id,
      })
    )
    expect(avisos.success).toHaveBeenCalledWith("Campaña activada", {
      description: CAMPANA.nombre,
    })
  })

  it("tras activar, el foco va al título de la ficha aunque «Activar» desaparezca", async () => {
    const usuario = userEvent.setup()
    const ficha = (props: Parameters<typeof AccionesCampana>[0]) => (
      <header>
        <h1>{CAMPANA.nombre}</h1>
        <AccionesCampana {...props} />
      </header>
    )
    const vista = render(
      ficha({
        campana: CAMPANA,
        puedeEditar: true,
        acciones: [{ accion: "activar", requiereMotivo: false, bloqueo: null }],
      })
    )
    // Como la Server Action: la ficha se refresca (ya activa, sin «Activar»)
    // antes de que el diálogo se cierre.
    acciones.activarCampana.mockImplementation(async () => {
      vista.rerender(
        ficha({
          campana: { ...CAMPANA, estado: "ACTIVA" },
          puedeEditar: true,
          acciones: [
            { accion: "cancelar", requiereMotivo: true, bloqueo: null },
          ],
        })
      )
      return exito()
    })
    await usuario.click(screen.getByRole("button", { name: "Activar campaña" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Activar la campaña?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Activar campaña" })
    )
    const titulo = screen.getByRole("heading", { level: 1 })
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(titulo).toHaveAttribute("tabindex", "-1")
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("si se cierra sin confirmar, el foco vuelve al botón que lo abrió", async () => {
    const usuario = userEvent.setup()
    render(
      <header>
        <h1>{CAMPANA.nombre}</h1>
        <AccionesCampana
          campana={CAMPANA}
          puedeEditar
          acciones={[
            { accion: "activar", requiereMotivo: false, bloqueo: null },
          ]}
        />
      </header>
    )
    const activar = screen.getByRole("button", { name: "Activar campaña" })
    await usuario.click(activar)
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() => expect(activar).toHaveFocus())
    expect(acciones.activarCampana).not.toHaveBeenCalled()
  })

  it("cancelar explica que lo verificado o pagado no la impide y qué pasa con sus ofertas", async () => {
    const usuario = userEvent.setup()
    render(
      <AccionesCampana
        campana={{ ...CAMPANA, estado: "ACTIVA" }}
        puedeEditar
        acciones={[{ accion: "cancelar", requiereMotivo: true, bloqueo: null }]}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar campaña" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: `¿Cancelar «${CAMPANA.nombre}»?`,
    })
    expect(dialogo).toHaveAccessibleDescription(
      /^Puedes cancelarla si lo que los medios ya aceptaron está verificado o pagado;/
    )
    expect(dialogo).toHaveAccessibleDescription(
      /las que ya tienen obligaciones con medios se cierran solas\. No se puede deshacer\.$/
    )
    expect(dialogo).not.toHaveAccessibleDescription(/aceptó un cupo/)
  })

  it("cancelar pide el motivo y muestra el rechazo de la BD dentro del diálogo", async () => {
    const usuario = userEvent.setup()
    acciones.cancelarCampana.mockResolvedValue(
      fallo("La campaña tiene asignaciones en curso: no se puede cancelar.")
    )
    render(
      <AccionesCampana
        campana={CAMPANA}
        puedeEditar={false}
        acciones={[{ accion: "cancelar", requiereMotivo: true, bloqueo: null }]}
      />
    )
    expect(screen.queryByRole("link", { name: "Editar" })).toBeNull()
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar campaña" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo de la cancelación"),
      "Cambió la estrategia de la marca."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar campaña" })
    )
    await waitFor(() =>
      expect(acciones.cancelarCampana).toHaveBeenCalledWith({
        campanaId: CAMPANA.id,
        motivo: "Cambió la estrategia de la marca.",
      })
    )
    expect(
      await within(dialogo).findByText(
        "La campaña tiene asignaciones en curso: no se puede cancelar."
      )
    ).toBeInTheDocument()
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("archivar un borrador confirma sin motivo y vuelve al listado", async () => {
    const usuario = userEvent.setup()
    acciones.archivarCampana.mockResolvedValue(exito())
    render(
      <AccionesCampana
        campana={CAMPANA}
        puedeEditar
        acciones={[
          { accion: "archivar", requiereMotivo: false, bloqueo: null },
        ]}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Archivar campaña" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: `¿Archivar «${CAMPANA.nombre}»?`,
    })
    expect(dialogo).toHaveAccessibleDescription(
      /ya no podrás activarla\. No se puede deshacer\.$/
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Archivar campaña" })
    )
    await waitFor(() =>
      expect(acciones.archivarCampana).toHaveBeenCalledWith({
        campanaId: CAMPANA.id,
      })
    )
    expect(avisos.success).toHaveBeenCalledWith("Campaña archivada", {
      description: CAMPANA.nombre,
    })
    expect(enrutador.replace).toHaveBeenCalledWith("/campanas")
  })

  it("una cancelada se archiva; si la BD lo impide, sigue en la ficha con el porqué", async () => {
    const usuario = userEvent.setup()
    acciones.archivarCampana.mockResolvedValue(
      fallo("Solo se archivan campañas en borrador, canceladas o finalizadas.")
    )
    render(
      <AccionesCampana
        campana={{ ...CAMPANA, estado: "CANCELADA" }}
        puedeEditar={false}
        acciones={[
          { accion: "archivar", requiereMotivo: false, bloqueo: null },
        ]}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Archivar campaña" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    expect(dialogo).toHaveAccessibleDescription(
      /el equipo AMO conserva su historial/
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Archivar campaña" })
    )
    expect(
      await within(dialogo).findByText(
        "Solo se archivan campañas en borrador, canceladas o finalizadas."
      )
    ).toBeInTheDocument()
    expect(enrutador.replace).not.toHaveBeenCalled()
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("sin acciones ni edición no pinta nada", () => {
    const { container } = render(
      <AccionesCampana campana={CAMPANA} puedeEditar={false} acciones={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
