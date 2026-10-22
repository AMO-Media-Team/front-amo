import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { DOCUMENTO_DUPLICADO } from "../errores"
import { pagoFijo, SIN_PAGO } from "../fixtures"
import type { PagoEditable } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ guardarDatosPagoMedio: vi.fn() }))
vi.mock("../actions", () => acciones)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { FormularioPagoMedio } from "./formulario-pago"

const GUARDADO: PagoEditable = {
  resumen: pagoFijo(),
  guardado: {
    tipoDocumento: "CC",
    documentoRegistrado: true,
    cuentaRegistrada: true,
  },
  verificado: false,
}

const NUEVO: PagoEditable = {
  resumen: SIN_PAGO,
  guardado: {
    tipoDocumento: null,
    documentoRegistrado: false,
    cuentaRegistrada: false,
  },
  verificado: false,
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
})

const barra = () =>
  screen.queryByRole("region", { name: "Cambios sin guardar" })

describe("FormularioPagoMedio · con datos registrados", () => {
  it("nunca precarga números: muestra solo los resúmenes", () => {
    render(<FormularioPagoMedio pago={GUARDADO} />)
    expect(screen.getByLabelText("Número de documento nuevo")).toHaveValue("")
    expect(screen.getByText(/^Registrado:/)).toHaveTextContent(
      "Registrado: CC •••• 6789"
    )
    expect(screen.getByText("Nequi •••• 4821")).toBeInTheDocument()
    expect(screen.getByLabelText("Nombre del titular")).toHaveValue(
      "Ana María Pérez"
    )
    expect(barra()).toBeNull()
  })

  it("guarda la condición tributaria conservando documento y cuenta", async () => {
    const usuario = userEvent.setup()
    acciones.guardarDatosPagoMedio.mockResolvedValue(
      exito({ cuentaNueva: false, metodo: null })
    )
    render(<FormularioPagoMedio pago={GUARDADO} />)

    await usuario.click(screen.getByRole("switch", { name: /Declaro renta/ }))
    expect(barra()).not.toBeNull()
    await usuario.click(
      screen.getByRole("button", { name: "Guardar datos de pago" })
    )

    await waitFor(() =>
      expect(acciones.guardarDatosPagoMedio).toHaveBeenCalledTimes(1)
    )
    expect(acciones.guardarDatosPagoMedio.mock.calls[0][0]).toMatchObject({
      numeroDocumento: "",
      cambiarCuenta: false,
      esDeclarante: true,
    })
    expect(avisos.success).toHaveBeenCalledWith("Datos de pago guardados")
    await waitFor(() => expect(barra()).toBeNull())
  })

  it("«Cambiar de cuenta» abre el editor y «Conservar» lo cierra sin cambios", async () => {
    const usuario = userEvent.setup()
    render(<FormularioPagoMedio pago={GUARDADO} />)

    await usuario.click(
      screen.getByRole("button", { name: "Cambiar de cuenta" })
    )
    const metodos = screen.getByRole("radiogroup")
    expect(
      within(metodos).getByRole("radio", { name: /Billetera digital/ })
    ).toBeChecked()
    expect(screen.getByLabelText("Celular de la billetera")).toHaveValue("")
    expect(barra()).not.toBeNull()

    await usuario.click(
      screen.getByRole("button", { name: "Conservar la cuenta registrada" })
    )
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Cambiar de cuenta" })
    ).toBeInTheDocument()
    await waitFor(() => expect(barra()).toBeNull())
  })

  it("muestra en su campo el documento repetido en otro medio", async () => {
    const usuario = userEvent.setup()
    acciones.guardarDatosPagoMedio.mockResolvedValue(
      fallo(DOCUMENTO_DUPLICADO, { numeroDocumento: [DOCUMENTO_DUPLICADO] })
    )
    render(<FormularioPagoMedio pago={GUARDADO} />)

    const numero = screen.getByLabelText("Número de documento nuevo")
    await usuario.type(numero, "1.098.765.432")
    await usuario.click(
      screen.getByRole("button", { name: "Guardar datos de pago" })
    )

    expect(await screen.findByText(DOCUMENTO_DUPLICADO)).toBeInTheDocument()
    expect(numero).toHaveAttribute("aria-invalid", "true")
    expect(avisos.success).not.toHaveBeenCalled()
  })
})

describe("FormularioPagoMedio · primera vez", () => {
  it("explica por qué se piden los datos y que van cifrados", () => {
    render(<FormularioPagoMedio pago={NUEVO} />)
    expect(screen.getByText("Tus datos van cifrados")).toBeInTheDocument()
    expect(screen.getByRole("radiogroup")).toBeInTheDocument()
  })

  it("no envía sin titular, tipo de documento ni método de pago", async () => {
    const usuario = userEvent.setup()
    render(<FormularioPagoMedio pago={NUEVO} />)

    await usuario.type(screen.getByLabelText("Nombre del titular"), "A")
    await usuario.click(
      screen.getByRole("button", { name: "Guardar datos de pago" })
    )

    expect(
      await screen.findByText("Escribe el nombre del titular.")
    ).toBeInTheDocument()
    expect(screen.getByText("Elige el tipo de documento.")).toBeInTheDocument()
    expect(
      screen.getByText("Elige cómo quieres recibir tus pagos.")
    ).toBeInTheDocument()
    expect(acciones.guardarDatosPagoMedio).not.toHaveBeenCalled()
  })

  it("al elegir billetera pide su celular", async () => {
    const usuario = userEvent.setup()
    render(<FormularioPagoMedio pago={NUEVO} />)
    await usuario.click(
      screen.getByRole("radio", { name: /Billetera digital/ })
    )
    expect(screen.getByLabelText("Celular de la billetera")).toHaveAttribute(
      "type",
      "tel"
    )
    expect(screen.queryByLabelText("Número de la cuenta")).toBeNull()
  })
})
