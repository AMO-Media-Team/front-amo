import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { FilaPendiente } from "../tipos"

const acciones = vi.hoisted(() => ({ generarLiquidacion: vi.fn() }))
vi.mock("../actions", () => acciones)
const navegacion = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { TablaPendientes } from "./tabla-pendientes"

const AHORA = new Date("2026-10-23T15:00:00Z").getTime()
const LIQ = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"

const RADIO: FilaPendiente = {
  medioId: "0192f3a4-5b6c-7d8e-9f01-0000000000c1",
  medio: "Radio Pasto",
  municipio: "Pasto",
  asignaciones: 3,
  montoMedio: 450_000,
  primeraVerificada: "2026-10-02T15:00:00Z",
  ultimaVerificada: "2026-10-20T15:00:00Z",
  ultimaLiquidacionFin: null,
  requiereDocumentoSoporte: true,
  datosPagoListos: false,
  segSocialPendiente: true,
}

const RECIENTE: FilaPendiente = {
  ...RADIO,
  medioId: "0192f3a4-5b6c-7d8e-9f01-0000000000c2",
  medio: "Creador Cali",
  primeraVerificada: "2026-10-20T15:00:00Z",
  requiereDocumentoSoporte: false,
  datosPagoListos: true,
  segSocialPendiente: false,
}

beforeEach(() => {
  acciones.generarLiquidacion.mockReset()
  navegacion.push.mockReset()
})

function renderizar(sugerido: { inicio: string; fin: string } | null) {
  const usuario = userEvent.setup()
  render(
    <NuqsTestingAdapter>
      <TablaPendientes
        filas={[RADIO, RECIENTE]}
        total={2}
        ahora={AHORA}
        sugerido={sugerido}
        hoy="2026-10-23"
        verMedios
      />
    </NuqsTestingAdapter>
  )
  return {
    usuario,
    tabla: screen.getByRole("table", { name: "Medios por liquidar" }),
  }
}

const SUGERIDO = { inicio: "2026-10-01", fin: "2026-10-15" }

describe("TablaPendientes (LIQ-001)", () => {
  it("muestra el valor estimado, el documento del pago y los avisos", () => {
    const { tabla } = renderizar(SUGERIDO)
    const fila = within(tabla).getByRole("row", { name: /Radio Pasto/ })
    expect(
      within(fila).getByRole("link", { name: "Radio Pasto" })
    ).toHaveAttribute("href", `/operacion/medios/${RADIO.medioId}`)
    expect(within(fila).getByText("$ 450.000")).toBeInTheDocument()
    expect(within(fila).getByText("Documento soporte")).toBeInTheDocument()
    expect(
      within(fila).getByText("Datos de pago incompletos")
    ).toBeInTheDocument()
    expect(
      within(fila).getByText("Seguridad social pendiente")
    ).toBeInTheDocument()
    const otra = within(tabla).getByRole("row", { name: /Creador Cali/ })
    expect(within(otra).getByText("Factura del medio")).toBeInTheDocument()
    expect(within(otra).getByText("Al día")).toBeInTheDocument()
  })

  it("«Liquidar» genera la del medio y abre su ficha", async () => {
    acciones.generarLiquidacion.mockResolvedValue(exito({ liquidacionId: LIQ }))
    const { usuario, tabla } = renderizar(SUGERIDO)
    await usuario.click(
      within(tabla).getByRole("button", { name: "Liquidar Radio Pasto" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Liquidar Radio Pasto",
    })
    expect(
      within(dialogo).getByText(/Las verificadas después del 15 de octubre/)
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Generar la liquidación" })
    )
    expect(acciones.generarLiquidacion).toHaveBeenCalledWith({
      medioId: RADIO.medioId,
      inicio: "2026-10-01",
      fin: "2026-10-15",
    })
    expect(navegacion.push).toHaveBeenCalledWith(
      `/finanzas/liquidaciones/${LIQ}`
    )
  })

  it("advierte si con ese periodo no entra ninguna de sus verificadas", async () => {
    const { usuario, tabla } = renderizar(SUGERIDO)
    await usuario.click(
      within(tabla).getByRole("button", { name: "Liquidar Creador Cali" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Liquidar Creador Cali",
    })
    expect(
      within(dialogo).getByText(/con este periodo no entra ninguna/)
    ).toBeInTheDocument()
  })

  it("sin permiso de generar no ofrece «Liquidar»", () => {
    const { tabla } = renderizar(null)
    expect(
      within(tabla).queryByRole("button", { name: /^Liquidar/ })
    ).not.toBeInTheDocument()
  })
})
