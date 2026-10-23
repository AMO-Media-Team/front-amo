import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { ASIGNACION_ID } from "../fixtures"
import { interpretarAccion } from "../siguiente-accion"
import type { AccionMedio } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  desistirAsignacion: vi.fn(),
  descargarContenido: vi.fn(),
  firmarArchivoContenido: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { AccionesAsignacion } from "./acciones-asignacion"
import { ID_LO_QUE_SIGUE } from "./ids"

const AHORA = new Date("2026-10-23T12:00:00.000Z").getTime()

const DESCARGAR = interpretarAccion({
  asignacionId: ASIGNACION_ID,
  ofertaTitulo: "Reel de Halloween",
  accion: "DESCARGAR",
  venceAt: "2026-10-30T05:00:00.000Z",
  numero: null,
  corte: null,
}) as AccionMedio

function pintar(props: Partial<Parameters<typeof AccionesAsignacion>[0]> = {}) {
  const usuario = userEvent.setup()
  const resultado = render(
    <>
      <h2 id={ID_LO_QUE_SIGUE} tabIndex={-1}>
        Lo que sigue
      </h2>
      <AccionesAsignacion
        asignacionId={ASIGNACION_ID}
        ofertaTitulo="Reel de Halloween"
        accion={DESCARGAR}
        desistirHasta="2026-10-24T05:00:00.000Z"
        ahoraServidor={AHORA}
        {...props}
      />
    </>
  )
  return { usuario, ...resultado }
}

describe("AccionesAsignacion", () => {
  beforeEach(() => {
    acciones.desistirAsignacion.mockReset()
    avisos.success.mockReset()
  })

  it("el pie lleva lo que sigue y, mientras se pueda, desistir", () => {
    pintar()
    const pie = screen.getByRole("region", { name: "Acciones de la campaña" })
    expect(
      within(pie).getByRole("link", { name: "Ver y descargar" })
    ).toHaveAttribute("href", `/mis-campanas/${ASIGNACION_ID}/contenido`)
    expect(within(pie).getByRole("button", { name: "Desistir" })).toBeVisible()
  })

  it("sin acción ni desistir, no hay pie", () => {
    const { container } = pintar({ accion: null, desistirHasta: null })
    expect(container.querySelector("section")).toBeNull()
  })

  it("desistir pide el motivo y muestra el error de la BD en el diálogo", async () => {
    acciones.desistirAsignacion.mockResolvedValueOnce(
      fallo("Ya no puedes desistir de esta asignación.")
    )
    const { usuario } = pintar()
    await usuario.click(screen.getByRole("button", { name: "Desistir" }))
    const dialogo = await screen.findByRole("alertdialog")
    expect(
      within(dialogo).getByRole("heading", {
        name: "¿Desistir de «Reel de Halloween»?",
      })
    ).toBeVisible()

    // Sin motivo no se envía.
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Desistir" })
    )
    expect(acciones.desistirAsignacion).not.toHaveBeenCalled()
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      /al menos 5 caracteres/
    )

    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Acepté por error o con otra cuenta.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Desistir" })
    )
    expect(acciones.desistirAsignacion).toHaveBeenCalledWith({
      asignacionId: ASIGNACION_ID,
      motivo: "Acepté por error o con otra cuenta.",
    })
    expect(
      await within(dialogo).findByText(
        "Ya no puedes desistir de esta asignación."
      )
    ).toBeVisible()
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })

  it("al desistir avisa, cierra y deja el foco en «Lo que sigue»", async () => {
    acciones.desistirAsignacion.mockResolvedValueOnce(exito())
    const { usuario, rerender } = pintar()
    await usuario.click(screen.getByRole("button", { name: "Desistir" }))
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "¿Por qué desistes?" }),
      "Ya no tengo espacio en esas fechas."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Desistir" })
    )
    // La página vuelve a pintarse sin acción ni desistir (`refresh()`).
    rerender(
      <>
        <h2 id={ID_LO_QUE_SIGUE} tabIndex={-1}>
          Lo que sigue
        </h2>
        <AccionesAsignacion
          asignacionId={ASIGNACION_ID}
          ofertaTitulo="Reel de Halloween"
          accion={null}
          desistirHasta={null}
          ahoraServidor={AHORA}
        />
      </>
    )
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Desististe de la campaña",
      expect.objectContaining({ description: expect.any(String) })
    )
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Lo que sigue" })
      ).toHaveFocus()
    )
    expect(
      screen.queryByRole("region", { name: "Acciones de la campaña" })
    ).not.toBeInTheDocument()
  })
})
