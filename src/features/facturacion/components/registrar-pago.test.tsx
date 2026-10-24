import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatearCOP } from "@/lib/format"
import { exito, fallo } from "@/lib/result"

import type { EstadoFactura } from "../tipos"

// Las Server Actions no corren en jsdom: espías con lo que respondería la BD.
const acciones = vi.hoisted(() => ({
  prepararArchivoFactura: vi.fn(),
  confirmarArchivoFactura: vi.fn(),
  registrarPagoFactura: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// El soporte ya elegido y subido: la subida real se prueba en su hook.
const archivo = vi.hoisted(() => ({
  elegido: null as File | null,
  lista: null,
  elemento: null,
  activa: false,
  elegir: vi.fn(),
  descartar: vi.fn(),
  reintentar: vi.fn(),
  cancelar: vi.fn(),
  obtener: vi.fn(),
}))
vi.mock("./use-archivo-soporte", () => ({ useArchivoSoporte: () => archivo }))

import { RegistrarPago } from "./registrar-pago"

const FACTURA = "0192f3a4-5b6c-7d8e-9f01-00000000fa01"
const RUTA = `pago/${FACTURA}/0192f3a4-5b6c-7d8e-9f01-0000000000f2.pdf`
/** 23 de octubre de 2026 en Bogotá. */
const AHORA = new Date("2026-10-23T15:00:00.000Z")

function pintar(estado: EstadoFactura) {
  return render(
    <RegistrarPago
      facturaId={FACTURA}
      numero="FE1042"
      anunciante="Tienda La 14"
      saldo={1_000_000}
      estado={estado}
      fechaEmision="2026-09-01"
    />
  )
}

async function abrir() {
  const usuario = userEvent.setup()
  await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
  const dialogo = await screen.findByRole("dialog", { name: "Registrar pago" })
  return { usuario, dialogo }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  archivo.elegido = new File(["%PDF"], "soporte.pdf", {
    type: "application/pdf",
  })
  archivo.obtener.mockResolvedValue({ ok: true, ruta: RUTA })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("RegistrarPago", () => {
  it("un abono a una vencida no la pasa a pago parcial: sigue vencida", async () => {
    pintar("VENCIDA")
    const { usuario, dialogo } = await abrir()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Valor recibido" }),
      "400000"
    )
    expect(within(dialogo).getByText(/^Queda un saldo de/).textContent).toBe(
      `Queda un saldo de ${formatearCOP(600_000)}: la factura sigue vencida hasta que se pague el resto.`
    )
    expect(dialogo).not.toHaveTextContent(/pasa a pago parcial/)
  })

  it("un abono a una emitida la pasa a pago parcial", async () => {
    pintar("EMITIDA")
    const { usuario, dialogo } = await abrir()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Valor recibido" }),
      "400000"
    )
    expect(dialogo).toHaveTextContent(/la factura pasa a pago parcial/)
  })

  it("el error del servidor en el monto lleva el foco al campo cuando termina", async () => {
    const mensaje = "El pago más las retenciones no puede superar el saldo."
    acciones.registrarPagoFactura.mockResolvedValue(
      fallo(mensaje, { monto: [mensaje] })
    )
    pintar("EMITIDA")
    const { usuario, dialogo } = await abrir()
    const monto = within(dialogo).getByRole("textbox", {
      name: "Valor recibido",
    })
    await usuario.type(monto, "400000")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )

    await waitFor(() =>
      expect(acciones.registrarPagoFactura).toHaveBeenCalledWith(
        expect.objectContaining({ facturaId: FACTURA, soportePath: RUTA })
      )
    )
    await waitFor(() => expect(monto).toHaveFocus())
    expect(monto).toBeEnabled()
    expect(monto).toHaveAccessibleDescription(new RegExp(mensaje))
  })

  it("sin soporte, el foco llega a «Elegir archivo» y no se registra nada", async () => {
    archivo.elegido = null
    pintar("EMITIDA")
    const { usuario, dialogo } = await abrir()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Valor recibido" }),
      "400000"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )
    await waitFor(() =>
      expect(
        within(dialogo).getByRole("button", { name: "Elegir archivo" })
      ).toHaveFocus()
    )
    expect(
      within(dialogo).getByText("Carga el soporte del pago.")
    ).toBeVisible()
    expect(acciones.registrarPagoFactura).not.toHaveBeenCalled()
  })

  it("registrado, cierra el diálogo", async () => {
    acciones.registrarPagoFactura.mockResolvedValue(
      exito({ estado: "VENCIDA", saldo: 600_000 })
    )
    pintar("VENCIDA")
    const { usuario, dialogo } = await abrir()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Valor recibido" }),
      "400000"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
  })
})
