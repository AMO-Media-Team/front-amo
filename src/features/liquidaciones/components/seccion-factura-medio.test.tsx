import { render, screen, waitFor, within } from "@testing-library/react"
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

function seccion(cambios: Partial<SeccionFacturaMedioProps> = {}) {
  return (
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
}

function renderizar(cambios: Partial<SeccionFacturaMedioProps> = {}) {
  const usuario = userEvent.setup()
  const { rerender } = render(seccion(cambios))
  return Object.assign(usuario, {
    revalidar: (nuevos: Partial<SeccionFacturaMedioProps>) =>
      rerender(seccion({ ...cambios, ...nuevos })),
  })
}

async function elegirPdf(
  usuario: ReturnType<typeof userEvent.setup>,
  dialogo: HTMLElement
) {
  const pdf = new File(["%PDF-1.4"], "factura.pdf", {
    type: "application/pdf",
  })
  const entrada = dialogo.querySelector<HTMLInputElement>('input[type="file"]')
  expect(entrada).not.toBeNull()
  await usuario.upload(entrada!, pdf)
  return pdf
}

describe("SeccionFacturaMedio (LIQ-004, D83)", () => {
  it("registrada: número y descarga del PDF; Finanzas puede corregirla", () => {
    renderizar({ numero: "FE-1234", tieneArchivo: true })
    expect(screen.getByText("FE-1234")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "Descargar PDF de la factura del medio",
      })
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
    const pdf = await elegirPdf(usuario, dialogo)
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

  it("al volver a abrir trae el número vigente, sin el archivo ni los errores de antes", async () => {
    subida.subir.mockResolvedValue({ ok: true, datos: undefined, archivo: {} })
    const usuario = renderizar({ numero: "FE-10", tieneArchivo: true })
    await usuario.click(
      screen.getByRole("button", { name: "Corregir la factura" })
    )
    let dialogo = await screen.findByRole("dialog")
    const numero = within(dialogo).getByLabelText("Número de la factura")
    expect(numero).toHaveValue("FE-10")
    await usuario.clear(numero)
    await usuario.type(numero, "FE-11")
    await elegirPdf(usuario, dialogo)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar la factura" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    // La ficha se revalida con el número nuevo; el diálogo sigue montado.
    usuario.revalidar({ numero: "FE-11" })
    await usuario.click(
      screen.getByRole("button", { name: "Corregir la factura" })
    )
    dialogo = await screen.findByRole("dialog")
    expect(within(dialogo).getByLabelText("Número de la factura")).toHaveValue(
      "FE-11"
    )
    expect(within(dialogo).queryByText("factura.pdf")).toBeNull()
  })

  it("si se cerró con errores, al abrir de nuevo empieza limpio", async () => {
    const usuario = renderizar({ numero: "FE-10", tieneArchivo: true })
    await usuario.click(
      screen.getByRole("button", { name: "Corregir la factura" })
    )
    let dialogo = await screen.findByRole("dialog")
    await usuario.clear(within(dialogo).getByLabelText("Número de la factura"))
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar la factura" })
    )
    expect(
      within(dialogo).getByLabelText("Número de la factura")
    ).toHaveAttribute("aria-invalid", "true")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    await usuario.click(
      screen.getByRole("button", { name: "Corregir la factura" })
    )
    dialogo = await screen.findByRole("dialog")
    const numero = within(dialogo).getByLabelText("Número de la factura")
    expect(numero).toHaveValue("FE-10")
    expect(numero).not.toHaveAttribute("aria-invalid")
    expect(
      within(dialogo).queryByText("Elige el PDF de la factura.")
    ).toBeNull()
  })
})
