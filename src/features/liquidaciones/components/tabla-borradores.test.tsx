import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { FilaLiquidacion } from "../tipos"

const acciones = vi.hoisted(() => ({ aprobarLiquidaciones: vi.fn() }))
vi.mock("../actions", () => acciones)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { TablaBorradores } from "./tabla-borradores"

const AHORA = new Date("2026-10-23T15:00:00Z").getTime()

function fila(
  numero: number,
  cambios: Partial<FilaLiquidacion> = {}
): FilaLiquidacion {
  return {
    id: `0192f3a4-5b6c-7d8e-9f01-0000000000a${numero}`,
    estado: "BORRADOR",
    medioId: `0192f3a4-5b6c-7d8e-9f01-0000000000c${numero}`,
    medio: `Medio ${numero}`,
    periodoInicio: "2026-10-01",
    periodoFin: "2026-10-15",
    asignaciones: 2,
    montoMedio: 200_000,
    montoRetenciones: 12_000,
    montoNeto: 188_000,
    requiereDocumentoSoporte: true,
    alertaSegSocial: false,
    generadaPorMi: false,
    creadaAt: "2026-10-16T15:00:00Z",
    aprobadaAt: null,
    anuladaAt: null,
    fechaPago: null,
    documento: null,
    numeroFacturaMedio: null,
    dispersion: null,
    esDemo: false,
    ...cambios,
  }
}

const AJENA = fila(1)
const PROPIA = fila(2, { generadaPorMi: true })
const CON_ALERTA = fila(3, { alertaSegSocial: true })

beforeEach(() => {
  acciones.aprobarLiquidaciones.mockReset()
  avisos.success.mockReset()
})

function renderizar({
  puedeAprobar = true,
  superadmin = false,
}: { puedeAprobar?: boolean; superadmin?: boolean } = {}) {
  const usuario = userEvent.setup()
  render(
    <NuqsTestingAdapter>
      <h2 id="titulo-vista-liquidaciones" tabIndex={-1}>
        Por aprobar
      </h2>
      <TablaBorradores
        filas={[AJENA, PROPIA, CON_ALERTA]}
        total={3}
        ahora={AHORA}
        puedeAprobar={puedeAprobar}
        superadmin={superadmin}
        politica="BLOQUEAR"
      />
    </NuqsTestingAdapter>
  )
  const tabla = screen.getByRole("table", {
    name: "Liquidaciones por aprobar",
  })
  return { usuario, tabla }
}

describe("TablaBorradores (LIQ-003, D17)", () => {
  it("la que generó quien mira sale sin casilla activa y dice por qué", () => {
    const { tabla } = renderizar()
    expect(
      within(tabla).getByRole("checkbox", {
        name: "No puedes aprobar la liquidación de Medio 2: la generaste tú",
      })
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar la liquidación de Medio 1",
      })
    ).toBeEnabled()
    expect(within(tabla).getAllByText("Por ti")).toHaveLength(1)
  })

  it("un SUPERADMIN sí puede elegir la que generó", () => {
    const { tabla } = renderizar({ superadmin: true })
    expect(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar la liquidación de Medio 2",
      })
    ).toBeEnabled()
  })

  it("«todas» marca solo las que se pueden aprobar", async () => {
    const { usuario, tabla } = renderizar()
    await usuario.click(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar todas las que puedes aprobar en esta página",
      })
    )
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument()
  })

  it("aprueba las elegidas y muestra el resultado por liquidación", async () => {
    acciones.aprobarLiquidaciones.mockResolvedValue(
      exito([
        { liquidacionId: AJENA.id, ok: true, error: null },
        {
          liquidacionId: CON_ALERTA.id,
          ok: false,
          error: "Seguridad social pendiente: el medio supera el umbral.",
        },
      ])
    )
    const { usuario, tabla } = renderizar()
    await usuario.click(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar la liquidación de Medio 1",
      })
    )
    await usuario.click(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar la liquidación de Medio 3",
      })
    )
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))

    const dialogo = await screen.findByRole("dialog", {
      name: "¿Aprobar 2 liquidaciones?",
    })
    expect(
      within(dialogo).getByText(/1 tiene «Seguridad social pendiente»/)
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )

    expect(acciones.aprobarLiquidaciones).toHaveBeenCalledWith({
      liquidacionIds: [AJENA.id, CON_ALERTA.id],
    })
    const resultado = await screen.findByRole("dialog", {
      name: "Resultado de la aprobación",
    })
    await waitFor(() =>
      expect(
        within(resultado).getByRole("heading", {
          name: "Resultado de la aprobación",
        })
      ).toHaveFocus()
    )
    expect(
      within(resultado).getByText(
        "Se aprobó 1 liquidación; 1 no se pudo aprobar."
      )
    ).toBeInTheDocument()
    expect(
      within(resultado).getByText(
        "Seguridad social pendiente: el medio supera el umbral."
      )
    ).toBeInTheDocument()
    expect(avisos.success).toHaveBeenCalledWith(
      "Se aprobó 1 liquidación; 1 no se pudo aprobar."
    )
  })

  it("al cancelar, el foco vuelve al «Aprobar» de la barra (la selección sigue)", async () => {
    const { usuario, tabla } = renderizar()
    await usuario.click(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar la liquidación de Medio 1",
      })
    )
    const aprobar = screen.getByRole("button", { name: "Aprobar" })
    await usuario.click(aprobar)
    const dialogo = await screen.findByRole("dialog", {
      name: "¿Aprobar 1 liquidación?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(aprobar).toHaveFocus())
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument()
    expect(acciones.aprobarLiquidaciones).not.toHaveBeenCalled()
  })

  it("al cerrar el resultado, el foco va al título de la vista", async () => {
    acciones.aprobarLiquidaciones.mockResolvedValue(
      exito([{ liquidacionId: AJENA.id, ok: true, error: null }])
    )
    const { usuario, tabla } = renderizar()
    await usuario.click(
      within(tabla).getByRole("checkbox", {
        name: "Seleccionar la liquidación de Medio 1",
      })
    )
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "¿Aprobar 1 liquidación?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )
    const resultado = await screen.findByRole("dialog", {
      name: "Resultado de la aprobación",
    })
    await usuario.click(
      within(resultado).getByRole("button", { name: "Listo" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Por aprobar" })).toHaveFocus()
    )
  })

  it("sin permiso de aprobar no hay casillas", () => {
    const { tabla } = renderizar({ puedeAprobar: false })
    expect(within(tabla).queryAllByRole("checkbox")).toHaveLength(0)
  })
})
