import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import { ID_DOCUMENTO_SOPORTE, ID_ESTADO_LIQUIDACION } from "../foco"
import {
  BLOQUEO_GENERADA_POR_MI,
  TEXTO_REQUIERE_NOTA_AJUSTE,
} from "../presentacion"

const acciones = vi.hoisted(() => ({
  aprobarLiquidaciones: vi.fn(),
  anularLiquidacion: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const navegacion = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import {
  AccionesLiquidacion,
  type AccionesLiquidacionProps,
} from "./acciones-liquidacion"

const LIQ = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"

beforeEach(() => {
  acciones.aprobarLiquidaciones.mockReset()
  acciones.anularLiquidacion.mockReset()
  avisos.success.mockReset()
  navegacion.refresh.mockReset()
})

function renderizar(cambios: Partial<AccionesLiquidacionProps> = {}) {
  const usuario = userEvent.setup()
  render(
    <>
      <section id={ID_ESTADO_LIQUIDACION} tabIndex={-1}>
        Estado
      </section>
      <AccionesLiquidacion
        liquidacionId={LIQ}
        titulo="Radio Pasto · 1 – 15 oct 2026"
        ofreceAprobar
        bloqueoAprobar={null}
        ofreceAnular
        avisoAnular={null}
        requiereNotaAjuste={false}
        advertenciaSegSocial={null}
        {...cambios}
      />
      <section id={ID_DOCUMENTO_SOPORTE} tabIndex={-1}>
        Documento soporte
      </section>
    </>
  )
  return usuario
}

describe("AccionesLiquidacion", () => {
  it("«Aprobar» deshabilitado con el porqué si la generó quien mira (D17)", () => {
    renderizar({ bloqueoAprobar: BLOQUEO_GENERADA_POR_MI })
    const aprobar = screen.getByRole("button", { name: "Aprobar" })
    expect(aprobar).toBeDisabled()
    expect(aprobar).toHaveAccessibleDescription(BLOQUEO_GENERADA_POR_MI)
  })

  it("aprueba y lleva el foco al aviso del estado", async () => {
    acciones.aprobarLiquidaciones.mockResolvedValue(
      exito([{ liquidacionId: LIQ, ok: true, error: null }])
    )
    const usuario = renderizar({
      advertenciaSegSocial: "Seguridad social pendiente: no se aprobará.",
    })
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar la liquidación?",
    })
    expect(
      within(dialogo).getByText("Seguridad social pendiente: no se aprobará.")
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )
    expect(acciones.aprobarLiquidaciones).toHaveBeenCalledWith({
      liquidacionIds: [LIQ],
    })
    await waitFor(() =>
      expect(document.getElementById(ID_ESTADO_LIQUIDACION)).toHaveFocus()
    )
    expect(avisos.success).toHaveBeenCalledWith("Liquidación aprobada", {
      description: "Radio Pasto · 1 – 15 oct 2026",
    })
  })

  it("si la BD no la aprueba, el motivo queda dentro del diálogo", async () => {
    acciones.aprobarLiquidaciones.mockResolvedValue(
      exito([
        {
          liquidacionId: LIQ,
          ok: false,
          error: "Seguridad social pendiente: el medio supera el umbral.",
        },
      ])
    )
    const usuario = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )
    expect(
      await within(dialogo).findByText(
        "Seguridad social pendiente: el medio supera el umbral."
      )
    ).toBeInTheDocument()
    expect(navegacion.refresh).toHaveBeenCalled()
  })

  it("anular pide motivo y advierte si ya salió en un archivo de pagos", async () => {
    acciones.anularLiquidacion.mockResolvedValue(exito())
    const usuario = renderizar({
      avisoAnular:
        "Ya está en el archivo de pagos del 20 de octubre de 2026: confirma con tesorería que el banco no la pagó.",
    })
    await usuario.click(screen.getByRole("button", { name: "Anular" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Anular la liquidación?",
    })
    expect(
      within(dialogo).getByText(
        /confirma con tesorería que el banco no la pagó/
      )
    ).toBeInTheDocument()
    await usuario.type(
      within(dialogo).getByLabelText("Motivo"),
      "Error en el corte del periodo"
    )
    await usuario.click(within(dialogo).getByRole("button", { name: "Anular" }))
    expect(acciones.anularLiquidacion).toHaveBeenCalledWith({
      liquidacionId: LIQ,
      motivo: "Error en el corte del periodo",
    })
    await waitFor(() =>
      expect(document.getElementById(ID_ESTADO_LIQUIDACION)).toHaveFocus()
    )
  })

  it("con el documento transmitido, «Anular» lleva primero a la nota de ajuste", async () => {
    const usuario = renderizar({ requiereNotaAjuste: true })
    await usuario.click(screen.getByRole("button", { name: "Anular" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "Primero, la nota de ajuste",
    })
    expect(
      within(dialogo).getByText(TEXTO_REQUIERE_NOTA_AJUSTE)
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Ir al documento soporte" })
    )
    await waitFor(() =>
      expect(document.getElementById(ID_DOCUMENTO_SOPORTE)).toHaveFocus()
    )
    expect(acciones.anularLiquidacion).not.toHaveBeenCalled()
  })

  it("sin nada que ofrecer no pinta nada", () => {
    const { container } = render(
      <AccionesLiquidacion
        liquidacionId={LIQ}
        titulo="X"
        ofreceAprobar={false}
        bloqueoAprobar={null}
        ofreceAnular={false}
        avisoAnular={null}
        requiereNotaAjuste={false}
        advertenciaSegSocial={null}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
