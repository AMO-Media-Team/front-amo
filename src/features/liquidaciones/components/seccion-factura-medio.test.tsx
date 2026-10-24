import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const acciones = vi.hoisted(() => ({
  prepararFacturaMedioInterna: vi.fn(),
  registrarFacturaMedioInterna: vi.fn(),
  descargarArchivoLiquidacion: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

/** La subida real (Storage, TUS) se sustituye: aquí importa qué se envía y cuándo. */
const subida = vi.hoisted(() => ({
  /** Las opciones del render en que se pulsó «Registrar» (como el hook real). */
  alSubir: null as null | {
    confirmar: (archivo: unknown) => Promise<unknown>
  },
  subir: vi.fn(),
}))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: (opciones: NonNullable<typeof subida.alSubir>) => {
    return {
      estado: "en-cola",
      progreso: 0,
      error: null,
      intento: 0,
      reanudaEn: null,
      activa: false,
      subir: (archivo: File) => {
        subida.alSubir = opciones
        return subida.subir(archivo)
      },
      reintentar: vi.fn(),
      cancelar: vi.fn(),
      reiniciar: vi.fn(),
    }
  },
}))

import {
  SeccionFacturaMedio,
  type SeccionFacturaMedioProps,
} from "./seccion-factura-medio"

const LIQ = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"

beforeEach(() => {
  subida.subir.mockReset()
  acciones.registrarFacturaMedioInterna.mockReset()
  avisos.success.mockReset()
})

function renderizar(cambios: Partial<SeccionFacturaMedioProps> = {}) {
  const usuario = userEvent.setup()
  render(
    <SeccionFacturaMedio
      liquidacionId={LIQ}
      medio="Radio Pasto"
      estado="APROBADA"
      numero={null}
      tieneArchivo={false}
      puedeRegistrar
      {...cambios}
    />
  )
  return usuario
}

describe("SeccionFacturaMedio (LIQ-004, D83)", () => {
  it("registrada: número y descarga del PDF; Finanzas puede corregirla", () => {
    renderizar({ numero: "FE-1234", tieneArchivo: true })
    expect(screen.getByText("FE-1234")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Descargar la factura del medio" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Corregir la factura" })
    ).toBeInTheDocument()
  })

  it("sin factura explica que el medio aún no la carga", () => {
    renderizar({ puedeRegistrar: false })
    expect(
      screen.getByText(/Radio Pasto aún no carga su factura/)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /factura/ })
    ).not.toBeInTheDocument()
  })

  it("pagada o anulada ya no se edita", () => {
    renderizar({ estado: "PAGADA", numero: "FE-1" })
    expect(
      screen.queryByRole("button", { name: "Corregir la factura" })
    ).not.toBeInTheDocument()
  })

  it("exige número y PDF, con cada error en su campo", async () => {
    const usuario = renderizar()
    await usuario.click(
      screen.getByRole("button", { name: "Registrar la factura" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Registrar la factura de Radio Pasto",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar la factura" })
    )
    const numero = within(dialogo).getByLabelText("Número de la factura")
    expect(numero).toHaveAttribute("aria-invalid", "true")
    expect(numero).toHaveAccessibleDescription(
      /Escribe el número de la factura\./
    )
    expect(
      within(dialogo).getByText("Elige el PDF de la factura.")
    ).toBeInTheDocument()
    expect(subida.subir).not.toHaveBeenCalled()
  })

  it("sube el PDF y confirma con el número escrito", async () => {
    subida.subir.mockResolvedValue({ ok: true, datos: undefined, archivo: {} })
    const usuario = renderizar()
    await usuario.click(
      screen.getByRole("button", { name: "Registrar la factura" })
    )
    const dialogo = await screen.findByRole("dialog")
    await usuario.type(
      within(dialogo).getByLabelText("Número de la factura"),
      "fe-77"
    )
    const pdf = new File(["%PDF-1.4"], "factura.pdf", {
      type: "application/pdf",
    })
    const entrada =
      dialogo.querySelector<HTMLInputElement>('input[type="file"]')
    expect(entrada).not.toBeNull()
    await usuario.upload(entrada!, pdf)
    expect(await within(dialogo).findByText("factura.pdf")).toBeInTheDocument()

    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar la factura" })
    )
    expect(subida.subir).toHaveBeenCalledWith(pdf)
    await subida.alSubir?.confirmar({ ruta: "x" })
    expect(acciones.registrarFacturaMedioInterna).toHaveBeenCalledWith({
      liquidacionId: LIQ,
      numero: "fe-77",
      archivo: { ruta: "x" },
    })
    expect(avisos.success).toHaveBeenCalledWith("Factura registrada", {
      description: "Radio Pasto: ya se puede registrar el pago.",
    })
  })
})
