import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { AsignacionEnCurso } from "../tipos"

const acciones = vi.hoisted(() => ({
  suspenderMedio: vi.fn(),
  reactivarMedio: vi.fn(),
  consultarAsignacionesEnCurso: vi.fn(),
}))
vi.mock("../actions", () => acciones)

const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { AccionesSuspensionMedio } from "./acciones-suspension"

const MEDIO = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa",
  nombre: "Radio Pasto",
}

function enCurso(cambios: Partial<AsignacionEnCurso> = {}): AsignacionEnCurso {
  return {
    id: "0192f3a4-0000-7000-8000-000000000001",
    estado: "ACEPTADA",
    estadoPrevioDisputa: null,
    ofertaId: "0192f3a4-0000-7000-8000-0000000000bb",
    oferta: "Lanzamiento de temporada",
    anunciante: "Café del Sur",
    fechaLimitePublicacion: "2026-10-30T22:00:00Z",
    montoBruto: 480000,
    disputaAbiertaId: null,
    cancelable: true,
    ...cambios,
  }
}

const EN_DISPUTA = enCurso({
  id: "0192f3a4-0000-7000-8000-000000000002",
  estado: "EN_DISPUTA",
  oferta: "Reel del aniversario",
  cancelable: false,
  disputaAbiertaId: "0192f3a4-0000-7000-8000-0000000000dd",
})

function pintar(
  props: Partial<Parameters<typeof AccionesSuspensionMedio>[0]> = {}
) {
  return render(
    <AccionesSuspensionMedio
      medio={MEDIO}
      accion="suspender"
      verAsignaciones
      verDisputas
      {...props}
    />
  )
}

beforeEach(() => {
  acciones.suspenderMedio
    .mockReset()
    .mockResolvedValue(
      exito({ enCurso: { total: 2, cancelables: 1, enDisputa: 1 } })
    )
  acciones.reactivarMedio.mockReset().mockResolvedValue(exito())
  acciones.consultarAsignacionesEnCurso
    .mockReset()
    .mockResolvedValue(exito([enCurso(), EN_DISPUTA]))
  avisos.success.mockReset()
})

describe("AccionesSuspensionMedio · suspender", () => {
  it("al abrir lista las asignaciones en curso con enlace a cada ficha, en otra pestaña", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Suspender a Radio Pasto?",
    })
    expect(dialogo).toHaveTextContent(/Deja de ver ofertas/)
    // Contenido largo: el foco va al título para leerlo de arriba abajo.
    await waitFor(() =>
      expect(
        within(dialogo).getByRole("heading", {
          name: "¿Suspender a Radio Pasto?",
        })
      ).toHaveFocus()
    )
    expect(acciones.consultarAsignacionesEnCurso).toHaveBeenCalledWith({
      medioId: MEDIO.id,
    })

    const lista = await within(dialogo).findByRole("list", {
      name: "Asignaciones en curso",
    })
    // jsdom no separa el texto oculto del visible al calcular el nombre.
    const ficha = within(lista).getByRole("link", {
      name: /^Lanzamiento de temporada ?\(se abre en otra pestaña\)$/,
    })
    expect(ficha).toHaveAttribute(
      "href",
      "/operacion/asignaciones/0192f3a4-0000-7000-8000-000000000001"
    )
    expect(ficha).toHaveAttribute("target", "_blank")
    expect(
      within(lista).getByRole("link", {
        name: /^Ver la disputa ?de «Reel del aniversario» \(se abre en otra pestaña\)$/,
      })
    ).toHaveAttribute(
      "href",
      "/operacion/disputas/0192f3a4-0000-7000-8000-0000000000dd"
    )
    // El resumen visible es la región viva: se anuncia al llegar la lista.
    expect(within(dialogo).getByRole("status")).toHaveTextContent(
      /^Tiene 2 asignaciones en curso\. Abre cada una para decidir si la cancelas con su causa/
    )
  })

  it("exige el motivo, suspende y avisa cuántas siguen en curso", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    const dialogo = screen.getByRole("alertdialog")
    await within(dialogo).findByRole("list", { name: "Asignaciones en curso" })

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender medio" })
    )
    const campo = within(dialogo).getByLabelText("Motivo de la suspensión")
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Describe el motivo (al menos 5 caracteres)."
    )
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(campo).toHaveFocus()
    expect(acciones.suspenderMedio).not.toHaveBeenCalled()

    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "No publicó a tiempo en varias campañas que aceptó.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender medio" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(acciones.suspenderMedio).toHaveBeenCalledWith({
      medioId: MEDIO.id,
      motivo: "No publicó a tiempo en varias campañas que aceptó.",
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Suspendiste a Radio Pasto",
      expect.objectContaining({
        description:
          "Quedan 2 asignaciones en curso: revísalas en la ficha para decidir si se cancelan.",
        action: expect.objectContaining({ label: "Ver la lista" }),
      })
    )
  })

  it("tras suspender, el foco queda en el mismo botón, ahora «Reactivar»", async () => {
    const usuario = userEvent.setup()
    const vista = pintar()
    // Como la Server Action: la cabecera se refresca antes de cerrar el diálogo.
    acciones.suspenderMedio.mockImplementation(async () => {
      vista.rerender(
        <AccionesSuspensionMedio
          medio={MEDIO}
          accion="reactivar"
          verAsignaciones
          verDisputas
        />
      )
      return exito({ enCurso: { total: 0, cancelables: 0, enDisputa: 0 } })
    })
    const boton = screen.getByRole("button", { name: "Suspender" })
    await usuario.click(boton)
    const dialogo = screen.getByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo de la suspensión"),
      "Métricas que no cuadran"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender medio" })
    )
    const reactivar = await screen.findByRole("button", { name: "Reactivar" })
    expect(reactivar).toBe(boton)
    await waitFor(() => expect(reactivar).toHaveFocus())
    expect(avisos.success).toHaveBeenCalledWith(
      "Suspendiste a Radio Pasto",
      expect.objectContaining({
        description: "No tenía asignaciones en curso.",
        action: undefined,
      })
    )
  })

  it("un fallo de la BD se muestra dentro del diálogo y lo deja abierto", async () => {
    acciones.suspenderMedio.mockResolvedValue(
      fallo("El medio ya no está verificado.")
    )
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    const dialogo = screen.getByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo de la suspensión"),
      "Métricas que no cuadran"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Suspender medio" })
    )
    expect(
      await within(dialogo).findByText("El medio ya no está verificado.")
    ).toHaveAttribute("role", "alert")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("si la lista no carga, lo dice y se puede reintentar", async () => {
    acciones.consultarAsignacionesEnCurso
      .mockResolvedValueOnce(fallo("No pudimos cargar sus asignaciones."))
      .mockResolvedValueOnce(exito([]))
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    const dialogo = screen.getByRole("alertdialog")
    expect(
      await within(dialogo).findByText("No pudimos cargar sus asignaciones.")
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reintentar" })
    )
    expect(
      await within(dialogo).findByText(/^No tiene asignaciones en curso/)
    ).toBeInTheDocument()
    expect(acciones.consultarAsignacionesEnCurso).toHaveBeenCalledTimes(2)
  })

  it("sin `asignaciones.ver` no consulta y explica quién debe revisarlas", async () => {
    const usuario = userEvent.setup()
    pintar({ verAsignaciones: false })
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /No puedes ver sus asignaciones/
    )
    expect(acciones.consultarAsignacionesEnCurso).not.toHaveBeenCalled()
  })

  it("sin `disputas.ver`, la asignación en disputa no enlaza a la disputa", async () => {
    const usuario = userEvent.setup()
    pintar({ verDisputas: false })
    await usuario.click(screen.getByRole("button", { name: "Suspender" }))
    const lista = await screen.findByRole("list", {
      name: "Asignaciones en curso",
    })
    expect(
      within(lista).queryByRole("link", { name: /Ver la disputa/ })
    ).not.toBeInTheDocument()
    expect(lista).toHaveTextContent("En disputa: se decide al resolverla")
  })
})

describe("AccionesSuspensionMedio · reactivar", () => {
  it("pide el motivo con sugerencias y reactiva", async () => {
    const usuario = userEvent.setup()
    pintar({ accion: "reactivar" })
    await usuario.click(screen.getByRole("button", { name: "Reactivar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Reactivar a Radio Pasto?",
    })
    expect(acciones.consultarAsignacionesEnCurso).not.toHaveBeenCalled()
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Se resolvió el motivo de la suspensión.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reactivar medio" })
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(acciones.reactivarMedio).toHaveBeenCalledWith({
      medioId: MEDIO.id,
      motivo: "Se resolvió el motivo de la suspensión.",
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Reactivaste a Radio Pasto",
      expect.anything()
    )
  })

  it("un fallo se muestra dentro del diálogo de reactivación", async () => {
    acciones.reactivarMedio.mockResolvedValue(
      fallo("El medio ya no está suspendido.")
    )
    const usuario = userEvent.setup()
    pintar({ accion: "reactivar" })
    await usuario.click(screen.getByRole("button", { name: "Reactivar" }))
    const dialogo = screen.getByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo de la reactivación"),
      "Aclaró sus métricas"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reactivar medio" })
    )
    expect(
      await within(dialogo).findByText("El medio ya no está suspendido.")
    ).toBeInTheDocument()
  })
})
