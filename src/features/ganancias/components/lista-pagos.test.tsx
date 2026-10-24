import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ID_LIQUIDACION,
  ID_LIQUIDACION_ANTERIOR,
  liquidacion,
  liquidacionPorFacturar,
} from "../fixtures"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  cargarPagos: vi.fn(),
  firmarArchivoLiquidacion: vi.fn(),
}))
const avisos = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: avisos }))

import { ListaPagos } from "./lista-pagos"

const HOY = "2026-10-22"
const asignar = vi.fn()
const ubicacionOriginal = window.location

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...ubicacionOriginal, assign: asignar },
  })
})

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ubicacionOriginal,
  })
  vi.clearAllMocks()
})

/** Las tarjetas (celular): la tabla está oculta con `display: none` por consulta de contenedor. */
function tarjetas() {
  return within(screen.getByRole("list", { name: "Tus pagos" })).getAllByRole(
    "article"
  )
}

describe("ListaPagos", () => {
  it("una pagada muestra su fecha y deja descargar el soporte y el documento soporte (MED-015 c1)", async () => {
    acciones.firmarArchivoLiquidacion.mockResolvedValue({
      ok: true,
      datos: { url: "https://firmada.example/s.pdf", vigenciaSegundos: 300 },
    })
    render(
      <ListaPagos
        inicial={{ liquidaciones: [liquidacion()], siguiente: null }}
        hoy={HOY}
      />
    )
    const [tarjeta] = tarjetas()
    expect(
      within(tarjeta).getByRole("link", { name: "1 – 15 oct 2026" })
    ).toHaveAttribute("href", `/ganancias/${ID_LIQUIDACION}`)
    expect(within(tarjeta).getByText("Pagada el 21 oct 2026")).toBeVisible()
    expect(within(tarjeta).getByText(/7\.442\.720/)).toBeVisible()

    const soporte = within(tarjeta).getByRole("button", {
      name: "Soporte de pago del periodo 1 – 15 oct 2026",
    })
    expect(
      within(tarjeta).getByRole("button", {
        name: "Documento soporte del periodo 1 – 15 oct 2026",
      })
    ).toBeVisible()
    await userEvent.click(soporte)
    await waitFor(() =>
      expect(asignar).toHaveBeenCalledWith("https://firmada.example/s.pdf")
    )
    expect(acciones.firmarArchivoLiquidacion).toHaveBeenCalledWith({
      liquidacionId: ID_LIQUIDACION,
      archivo: "soporte_pago",
    })
  })

  it("si el archivo no está, lo dice y el foco se queda en el botón", async () => {
    acciones.firmarArchivoLiquidacion.mockResolvedValue({
      ok: false,
      error: "No encontramos el archivo o no tienes acceso a él.",
    })
    render(
      <ListaPagos
        inicial={{ liquidaciones: [liquidacion()], siguiente: null }}
        hoy={HOY}
      />
    )
    const boton = within(tarjetas()[0]).getByRole("button", {
      name: /^Documento soporte/,
    })
    await userEvent.click(boton)
    await waitFor(() =>
      expect(avisos.error).toHaveBeenCalledWith(
        "No pudimos descargar: documento soporte",
        { description: "No encontramos el archivo o no tienes acceso a él." }
      )
    )
    expect(asignar).not.toHaveBeenCalled()
    expect(boton).toHaveFocus()
  })

  it("el medio que factura ve «Carga tu factura» y la fecha prevista del pago", () => {
    render(
      <ListaPagos
        inicial={{
          liquidaciones: [liquidacionPorFacturar()],
          siguiente: null,
        }}
        hoy={HOY}
      />
    )
    const [tarjeta] = tarjetas()
    expect(within(tarjeta).getByText("Aprobada · por pagar")).toBeVisible()
    expect(
      within(tarjeta).getByText("Pago previsto hasta el 23 oct 2026")
    ).toBeVisible()
    expect(
      within(tarjeta).getByRole("link", {
        name: "Carga tu factura del periodo 1 – 15 oct 2026",
      })
    ).toHaveAttribute("href", `/ganancias/${ID_LIQUIDACION}#factura`)
    expect(within(tarjeta).queryByRole("button")).not.toBeInTheDocument()
  })

  it("en proceso de pago, en revisión y con seguridad social pendiente", () => {
    render(
      <ListaPagos
        inicial={{
          liquidaciones: [
            liquidacion({
              id: "a",
              estado: "APROBADA",
              fechaPago: null,
              fechaPagoEstimada: "2026-10-20",
            }),
            liquidacion({
              id: "b",
              estado: "BORRADOR",
              enviadaBancoAt: null,
              fechaPago: null,
              documento: null,
              alertaSegSocial: true,
            }),
          ],
          siguiente: null,
        }}
        hoy={HOY}
      />
    )
    const [enProceso, enRevision] = tarjetas()
    expect(within(enProceso).getByText("En proceso de pago")).toBeVisible()
    expect(
      within(enProceso).getByText(
        "Pago previsto hasta el 20 oct 2026: va con retraso"
      )
    ).toBeVisible()
    expect(within(enRevision).getByText("En revisión")).toBeVisible()
    expect(
      within(enRevision).getByText("Documento soporte en preparación")
    ).toBeVisible()
    expect(
      within(enRevision).getByText(/Seguridad social pendiente/)
    ).toBeVisible()
  })

  it("«Ver pagos anteriores» agrega la página siguiente y lo anuncia", async () => {
    acciones.cargarPagos.mockResolvedValue({
      ok: true,
      datos: {
        liquidaciones: [
          liquidacion({
            id: ID_LIQUIDACION_ANTERIOR,
            periodoInicio: "2026-09-16",
            periodoFin: "2026-09-30",
          }),
        ],
        siguiente: null,
      },
    })
    render(
      <ListaPagos
        inicial={{ liquidaciones: [liquidacion()], siguiente: ID_LIQUIDACION }}
        hoy={HOY}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Ver pagos anteriores" })
    )
    await waitFor(() => expect(tarjetas()).toHaveLength(2))
    expect(acciones.cargarPagos).toHaveBeenCalledWith({
      antesId: ID_LIQUIDACION,
    })
    expect(screen.getByRole("status")).toHaveTextContent(
      "Se agregó 1 pago anterior."
    )
    expect(
      screen.queryByRole("button", { name: "Ver pagos anteriores" })
    ).not.toBeInTheDocument()
  })

  it("sin pagos explica cuándo aparecerán", () => {
    render(
      <ListaPagos inicial={{ liquidaciones: [], siguiente: null }} hoy={HOY} />
    )
    expect(screen.getByText("Aún no tienes pagos")).toBeVisible()
  })
})
