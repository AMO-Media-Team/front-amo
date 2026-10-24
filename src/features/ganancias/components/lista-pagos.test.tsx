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

  it("mientras firma la descarga, el botón sigue enfocable y no admite otro toque", async () => {
    let responder: (valor: unknown) => void = () => {}
    acciones.firmarArchivoLiquidacion.mockReturnValue(
      new Promise((resolver) => {
        responder = resolver
      })
    )
    render(
      <ListaPagos
        inicial={{ liquidaciones: [liquidacion()], siguiente: null }}
        hoy={HOY}
      />
    )
    const boton = within(tarjetas()[0]).getByRole("button", {
      name: /^Soporte de pago/,
    })
    await userEvent.click(boton)
    expect(boton).toHaveFocus()
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAttribute("aria-busy", "true")
    expect(boton).not.toBeDisabled()
    await userEvent.keyboard("{Enter}")
    expect(acciones.firmarArchivoLiquidacion).toHaveBeenCalledTimes(1)

    responder({
      ok: true,
      datos: { url: "https://firmada.example/s.pdf", vigenciaSegundos: 300 },
    })
    await waitFor(() =>
      expect(asignar).toHaveBeenCalledWith("https://firmada.example/s.pdf")
    )
    expect(boton).not.toHaveAttribute("aria-disabled", "true")
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
      within(enRevision).getByText(
        "Seguridad social pendiente: cárgala para respaldar tus pagos."
      )
    ).toBeVisible()
  })

  it("el aviso de seguridad social solo va en las que esperan pago, según la política", () => {
    render(
      <ListaPagos
        inicial={{
          liquidaciones: [
            liquidacion({
              id: "a",
              estado: "BORRADOR",
              fechaPago: null,
              alertaSegSocial: true,
              bloqueaSegSocial: true,
            }),
            // Pagada con la alerta con que se generó: ya no pide nada.
            liquidacion({ id: "b", alertaSegSocial: true }),
          ],
          siguiente: null,
        }}
        hoy={HOY}
      />
    )
    const [bloqueada, pagada] = tarjetas()
    expect(
      within(bloqueada).getByText(
        "Seguridad social pendiente: cárgala para que podamos aprobar y pagar tu liquidación."
      )
    ).toBeVisible()
    expect(within(pagada).getByText("Pagada el 21 oct 2026")).toBeVisible()
    expect(
      within(pagada).queryByText(/Seguridad social pendiente/)
    ).not.toBeInTheDocument()
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
    // El foco no se pierde: pasa al primer pago agregado, que quedó encima
    // del botón, y el aviso final queda después de él.
    expect(
      within(tarjetas()[1]).getByRole("link", { name: "16 – 30 sept 2026" })
    ).toHaveFocus()
    expect(screen.getByText("Estos son todos tus pagos.")).toBeVisible()
  })

  it("mientras carga, «Ver pagos anteriores» sigue enfocable; sin pagos nuevos, el foco va al aviso final", async () => {
    let responder: (valor: unknown) => void = () => {}
    acciones.cargarPagos.mockReturnValue(
      new Promise((resolver) => {
        responder = resolver
      })
    )
    render(
      <ListaPagos
        inicial={{ liquidaciones: [liquidacion()], siguiente: ID_LIQUIDACION }}
        hoy={HOY}
      />
    )
    const boton = screen.getByRole("button", { name: "Ver pagos anteriores" })
    await userEvent.click(boton)
    const cargando = screen.getByRole("button", { name: "Cargando…" })
    expect(cargando).toHaveFocus()
    expect(cargando).toHaveAttribute("aria-disabled", "true")
    expect(cargando).not.toBeDisabled()
    // Un segundo Enter mientras carga no pide otra página.
    await userEvent.keyboard("{Enter}")
    expect(acciones.cargarPagos).toHaveBeenCalledTimes(1)

    responder({ ok: true, datos: { liquidaciones: [], siguiente: null } })
    await waitFor(() =>
      expect(screen.getByText("Estos son todos tus pagos.")).toHaveFocus()
    )
  })

  it("sin pagos explica cuándo aparecerán", () => {
    render(
      <ListaPagos inicial={{ liquidaciones: [], siguiente: null }} hoy={HOY} />
    )
    expect(screen.getByText("Aún no tienes pagos")).toBeVisible()
  })
})
