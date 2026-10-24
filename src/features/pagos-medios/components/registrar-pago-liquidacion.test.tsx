import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

// Las Server Actions no corren en jsdom: espías con lo que respondería la BD.
const acciones = vi.hoisted(() => ({
  prepararSoportePago: vi.fn(),
  confirmarSoportePago: vi.fn(),
  registrarPagoLiquidacion: vi.fn(),
  generarArchivoPagos: vi.fn(),
  descargarArchivoPagos: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
const shell = vi.hoisted(() => ({
  permisos: ["liquidaciones.registrar_pago"] as string[],
}))
vi.mock("@/components/layout/contexto-shell", () => ({
  useShell: () => ({ usuario: { permisos: shell.permisos } }),
}))
// La subida real (Storage) se prueba en su hook: aquí solo importa que se pida.
const subida = vi.hoisted(() => ({
  subir: vi.fn(),
  cancelar: vi.fn(),
  reiniciar: vi.fn(),
  reintentar: vi.fn(),
  estado: "en-cola",
  progreso: 0,
  error: null,
  intento: 0,
  reanudaEn: null,
  activa: false,
}))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: () => subida,
}))

import { MENSAJES_PAGOS } from "../errores"
import { MENSAJES_FORMULARIO_PAGO } from "../schemas"
import { RegistrarPagoLiquidacion } from "./registrar-pago-liquidacion"

const LIQUIDACION = "0199f3a0-0000-7000-8000-00000000a501"
const RUTA = `liquidacion/${LIQUIDACION}/pago/0199f3a0-0000-7000-8000-0000000000f1.pdf`
/** 23 de octubre de 2026 en Bogotá. */
const AHORA = new Date("2026-10-23T15:00:00.000Z")

function pintar(
  cambios: Partial<Parameters<typeof RegistrarPagoLiquidacion>[0]> = {}
) {
  return render(
    <RegistrarPagoLiquidacion
      liquidacionId={LIQUIDACION}
      medio="Radio Pasto"
      montoNeto={911_002}
      fechaMinima="2026-10-17"
      documentoListo
      {...cambios}
    />
  )
}

function elegirSoporte(dialogo: HTMLElement) {
  const entrada = dialogo.querySelector<HTMLInputElement>(
    'input[type="file"]:not([capture])'
  )
  if (!entrada) throw new Error("Sin zona de archivos")
  fireEvent.change(entrada, {
    target: {
      files: [
        new File(["%PDF"], "comprobante.pdf", { type: "application/pdf" }),
      ],
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  shell.permisos = ["liquidaciones.registrar_pago"]
  subida.subir.mockResolvedValue({
    ok: true,
    datos: { ruta: RUTA },
    archivo: { ruta: RUTA },
  })
  acciones.registrarPagoLiquidacion.mockResolvedValue(
    exito({ liquidacionId: LIQUIDACION })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe("RegistrarPagoLiquidacion", () => {
  it("no se ofrece sin el permiso de registrar pagos", () => {
    shell.permisos = ["liquidaciones.ver"]
    const { container } = pintar()
    expect(container).toBeEmptyDOMElement()
  })

  it("sin documento soporte ni factura queda deshabilitado, enfocable y dice qué falta (LIQ-006)", () => {
    pintar({ documentoListo: false })
    const boton = screen.getByRole("button", { name: "Registrar pago" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(MENSAJES_PAGOS.documentoRequerido)
    expect(boton).toHaveAccessibleDescription(/^Documento soporte requerido: /)
    boton.focus()
    expect(boton).toHaveFocus()
  })

  it("en una fila nombra el medio para el lector de pantalla", () => {
    pintar({ variante: "fila", documentoListo: false })
    expect(
      screen.getByRole("button", { name: "Registrar pago de Radio Pasto" })
    ).toBeInTheDocument()
    expect(screen.getByText("Documento soporte requerido")).toBeVisible()
  })

  it("valida antes de subir: cada error junto a su campo y el foco en el primero", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago",
    })
    expect(within(dialogo).getByLabelText("Fecha del pago")).toHaveValue(
      "2026-10-23"
    )

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )
    const referencia = within(dialogo).getByRole("textbox", {
      name: "Referencia del pago",
    })
    await waitFor(() => expect(referencia).toHaveFocus())
    expect(referencia).toHaveAccessibleDescription(
      new RegExp(
        `^${MENSAJES_FORMULARIO_PAGO.referencia.replace(/[()]/g, "\\$&")}`
      )
    )
    expect(
      within(dialogo).getByText(MENSAJES_FORMULARIO_PAGO.soporte)
    ).toBeVisible()
    expect(subida.subir).not.toHaveBeenCalled()
    expect(acciones.registrarPagoLiquidacion).not.toHaveBeenCalled()
  })

  it("no admite una fecha anterior a la mínima", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago",
    })
    const fecha = within(dialogo).getByLabelText("Fecha del pago")
    fireEvent.change(fecha, { target: { value: "2026-10-10" } })
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Referencia del pago" }),
      "TRF-1"
    )
    elegirSoporte(dialogo)
    await within(dialogo).findByText("comprobante.pdf")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )
    await waitFor(() => expect(fecha).toHaveFocus())
    expect(fecha).toHaveAccessibleDescription(/no puede ser anterior al 17/)
  })

  it("sube el soporte, registra el pago, avisa y cierra", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Referencia del pago" }),
      "TRF-20261023-40491"
    )
    elegirSoporte(dialogo)
    await within(dialogo).findByText("comprobante.pdf")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )

    await waitFor(() =>
      expect(acciones.registrarPagoLiquidacion).toHaveBeenCalledWith({
        liquidacionId: LIQUIDACION,
        fecha: "2026-10-23",
        referencia: "TRF-20261023-40491",
        soportePath: RUTA,
      })
    )
    expect(subida.subir).toHaveBeenCalledWith(expect.any(File))
    expect(avisos.success).toHaveBeenCalledWith("Pago registrado", {
      description: expect.stringContaining("Radio Pasto"),
    })
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registrar el pago" })
      ).toBeNull()
    )
  })

  it("si la BD rechaza la fecha, la marca y al reintentar no vuelve a subir el soporte", async () => {
    acciones.registrarPagoLiquidacion.mockResolvedValueOnce(
      fallo(
        "La fecha del pago va entre la generación de la liquidación y hoy.",
        {
          fecha: [
            "La fecha del pago va entre la generación de la liquidación y hoy.",
          ],
        }
      )
    )
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Referencia del pago" }),
      "TRF-1"
    )
    elegirSoporte(dialogo)
    await within(dialogo).findByText("comprobante.pdf")
    const registrar = within(dialogo).getByRole("button", {
      name: "Registrar pago",
    })
    await usuario.click(registrar)

    const fecha = within(dialogo).getByLabelText("Fecha del pago")
    await waitFor(() => expect(fecha).toHaveFocus())
    expect(fecha).toHaveAccessibleDescription(
      /^La fecha del pago va entre la generación/
    )
    expect(within(dialogo).getByText(/ · Cargado$/)).toBeInTheDocument()

    await usuario.click(registrar)
    await waitFor(() =>
      expect(acciones.registrarPagoLiquidacion).toHaveBeenCalledTimes(2)
    )
    expect(subida.subir).toHaveBeenCalledTimes(1)
  })

  it("un error general (sin campo) se muestra dentro del diálogo", async () => {
    acciones.registrarPagoLiquidacion.mockResolvedValueOnce(
      fallo(MENSAJES_PAGOS.documentoRequerido)
    )
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Referencia del pago" }),
      "TRF-1"
    )
    elegirSoporte(dialogo)
    await within(dialogo).findByText("comprobante.pdf")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar pago" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      MENSAJES_PAGOS.documentoRequerido
    )
    expect(
      screen.getByRole("dialog", { name: "Registrar el pago" })
    ).toBeVisible()
  })

  it("cada apertura empieza en blanco (lo escrito antes de cancelar no queda)", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    let dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Referencia del pago" }),
      "TRF-1"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registrar el pago" })
      ).toBeNull()
    )
    await usuario.click(screen.getByRole("button", { name: "Registrar pago" }))
    dialogo = await screen.findByRole("dialog", { name: "Registrar el pago" })
    expect(
      within(dialogo).getByRole("textbox", { name: "Referencia del pago" })
    ).toHaveValue("")
  })
})
