import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  prepararSoportePago: vi.fn(),
  confirmarSoportePago: vi.fn(),
  registrarPagoArchivo: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
vi.mock("@/components/layout/contexto-shell", () => ({
  useShell: () => ({
    usuario: { permisos: ["liquidaciones.registrar_pago"] },
  }),
}))
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
const opcionesSubida = vi.hoisted(() => ({ ultima: null as unknown }))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: (opciones: unknown) => {
    opcionesSubida.ultima = opciones
    return subida
  },
}))

import { MENSAJES_PAGOS } from "../errores"
import type { LiquidacionDeDispersion } from "../tipos"
import { RegistrarPagoArchivo } from "./registrar-pago-archivo"

const DISPERSION = "0199f3a0-0000-7000-8000-0000000000d1"
const A = "0199f3a0-0000-7000-8000-00000000a501"
const B = "0199f3a0-0000-7000-8000-00000000a502"
const C = "0199f3a0-0000-7000-8000-00000000a503"
const RUTA = `liquidacion/${A}/pago/0199f3a0-0000-7000-8000-0000000000f1.pdf`

function liquidacion(
  id: string,
  cambios: Partial<LiquidacionDeDispersion> = {}
): LiquidacionDeDispersion {
  return {
    id,
    medio: `Medio ${id.slice(-1)}`,
    periodoInicio: "2026-10-01",
    periodoFin: "2026-10-15",
    montoNeto: 100_000,
    estado: "APROBADA",
    fechaPago: null,
    referenciaPago: null,
    documentoListo: true,
    fechaMinimaPago: "2026-10-16",
    ...cambios,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-10-23T15:00:00.000Z"))
  vi.clearAllMocks()
  subida.subir.mockResolvedValue({
    ok: true,
    datos: { ruta: RUTA },
    archivo: { ruta: RUTA },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

async function llenarYEnviar(dialogo: HTMLElement) {
  const usuario = userEvent.setup()
  await usuario.type(
    within(dialogo).getByRole("textbox", { name: "Referencia del pago" }),
    "TRF-LOTE-1"
  )
  const entrada = dialogo.querySelector<HTMLInputElement>(
    'input[type="file"]:not([capture])'
  )
  fireEvent.change(entrada as HTMLInputElement, {
    target: {
      files: [new File(["%PDF"], "lote.pdf", { type: "application/pdf" })],
    },
  })
  await within(dialogo).findByText("lote.pdf")
  await usuario.click(
    within(dialogo).getByRole("button", { name: "Registrar pagos" })
  )
}

describe("RegistrarPagoArchivo", () => {
  it("sin nada por registrar no se ofrece", () => {
    const { container } = render(
      <RegistrarPagoArchivo dispersionId={DISPERSION} pendientes={[]} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("si a ninguna le alcanza el documento, explica por qué", () => {
    render(
      <RegistrarPagoArchivo
        dispersionId={DISPERSION}
        pendientes={[liquidacion(A, { documentoListo: false })]}
      />
    )
    const boton = screen.getByRole("button", {
      name: "Registrar el pago del archivo",
    })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(MENSAJES_PAGOS.documentoRequerido)
  })

  it("un comprobante para las que tienen documento; sube a la carpeta de la primera y la fecha mínima es la más reciente", async () => {
    acciones.registrarPagoArchivo.mockResolvedValue(
      exito({
        registradas: [
          { id: A, medio: "Medio 1" },
          { id: B, medio: "Medio 2" },
        ],
        fallidas: [],
      })
    )
    render(
      <RegistrarPagoArchivo
        dispersionId={DISPERSION}
        pendientes={[
          liquidacion(A),
          liquidacion(B, { fechaMinimaPago: "2026-10-18" }),
          liquidacion(C, { documentoListo: false }),
        ]}
      />
    )
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Registrar el pago del archivo" })
      )
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago del archivo",
    })
    expect(dialogo).toHaveAccessibleDescription(
      /^Un solo comprobante para 2 liquidaciones por .*200\.000: .*Quedan por fuera 1 liquidación sin documento soporte ni factura\.$/
    )
    expect(within(dialogo).getByLabelText("Fecha del pago")).toHaveAttribute(
      "min",
      "2026-10-18"
    )
    expect(opcionesSubida.ultima).toBeTruthy()

    await llenarYEnviar(dialogo)
    await waitFor(() =>
      expect(acciones.registrarPagoArchivo).toHaveBeenCalledWith({
        dispersionId: DISPERSION,
        liquidacionIds: [A, B],
        fecha: "2026-10-23",
        referencia: "TRF-LOTE-1",
        soportePath: RUTA,
      })
    )
    expect(avisos.success).toHaveBeenCalledWith("Pagos registrados", {
      description: expect.stringContaining("2 liquidaciones pagadas"),
    })
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registrar el pago del archivo" })
      ).toBeNull()
    )
  })

  it("si alguna no se pudo, lo dice dentro y deja el diálogo abierto", async () => {
    acciones.registrarPagoArchivo.mockResolvedValue(
      exito({
        registradas: [{ id: A, medio: "Medio 1" }],
        fallidas: [
          { id: B, medio: "Medio 2", mensaje: "Ya no está aprobada." },
        ],
      })
    )
    render(
      <RegistrarPagoArchivo
        dispersionId={DISPERSION}
        pendientes={[liquidacion(A), liquidacion(B)]}
      />
    )
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Registrar el pago del archivo" })
      )
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar el pago del archivo",
    })
    await llenarYEnviar(dialogo)
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      /^Registramos 1 de 2 pagos\. No pudimos registrar: Medio 2 \(Ya no está aprobada\)/
    )
    expect(avisos.success).toHaveBeenCalledWith("Pago registrado", {
      description: expect.stringContaining("1 liquidación pagada"),
    })
  })
})
