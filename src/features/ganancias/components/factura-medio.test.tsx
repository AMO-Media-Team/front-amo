import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ID_LIQUIDACION } from "../fixtures"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  prepararFacturaMedio: vi.fn(),
  confirmarFacturaMedio: vi.fn(),
  registrarFacturaMedio: vi.fn(),
  firmarArchivoLiquidacion: vi.fn(),
}))
const avisos = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: avisos }))

/** El PDF: la prueba decide si hay uno elegido y cómo termina su subida. */
const carga = vi.hoisted(() => ({
  subida: { activa: false, cancelar: () => {} },
  elegida: null as File | null,
  vistaPrevia: null,
  lista: null,
  elemento: null,
  elegir: vi.fn(),
  descartar: vi.fn(),
  reintentar: () => {},
  obtener: vi.fn(),
}))
vi.mock("@/components/archivos/use-carga-captura", () => ({
  useCargaCaptura: () => carga,
}))

import { SeccionFacturaMedio } from "./factura-medio"

const RUTA = `liquidacion/${ID_LIQUIDACION}/factura/0199f3a0-0000-7000-8000-00000000f001.pdf`
const PDF = new File(["%PDF-1.4"], "factura-octubre.pdf", {
  type: "application/pdf",
})

function renderizar(
  props: Partial<Parameters<typeof SeccionFacturaMedio>[0]> = {}
) {
  return render(
    <SeccionFacturaMedio
      liquidacionId={ID_LIQUIDACION}
      factura={{ numero: null, conArchivo: false }}
      puedeCargar
      periodo="1 – 15 oct 2026"
      {...props}
    />
  )
}

beforeEach(() => {
  carga.elegida = null
  carga.obtener.mockResolvedValue({
    ok: true,
    captura: { ruta: RUTA, bucket: "soportes" },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("SeccionFacturaMedio", () => {
  it("sin número ni PDF, cada error queda junto a su campo y el foco va al número", async () => {
    renderizar()
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar factura" })
    )
    const numero = screen.getByRole("textbox", { name: "Número de la factura" })
    expect(numero).toHaveFocus()
    expect(numero).toHaveAttribute("aria-invalid", "true")
    expect(numero).toHaveAccessibleDescription(
      "Como aparece en tu factura electrónica, con su prefijo. Escribe el número de tu factura."
    )
    expect(screen.getByText("Adjunta el PDF de tu factura.")).toBeVisible()
    expect(acciones.registrarFacturaMedio).not.toHaveBeenCalled()
  })

  it("con número pero sin PDF, el foco va a elegir el archivo", async () => {
    renderizar()
    await userEvent.type(
      screen.getByRole("textbox", { name: "Número de la factura" }),
      "fe-12"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar factura" })
    )
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toHaveFocus()
    expect(acciones.registrarFacturaMedio).not.toHaveBeenCalled()
  })

  it("envía el número y la ruta del PDF subido, y el foco llega a la constancia", async () => {
    carga.elegida = PDF
    acciones.registrarFacturaMedio.mockResolvedValue({
      ok: true,
      datos: undefined,
    })
    renderizar()
    expect(
      screen.getByRole("button", { name: "Quitar el PDF factura-octubre.pdf" })
    ).toBeVisible()
    await userEvent.type(
      screen.getByRole("textbox", { name: "Número de la factura" }),
      " fe-12 "
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar factura" })
    )
    await waitFor(() =>
      expect(acciones.registrarFacturaMedio).toHaveBeenCalledWith({
        liquidacionId: ID_LIQUIDACION,
        numero: " fe-12 ",
        archivoPath: RUTA,
      })
    )
    const constancia = await screen.findByRole("status")
    expect(constancia).toHaveTextContent("Factura registrada")
    expect(constancia).toHaveTextContent("FE-12")
    await waitFor(() => expect(constancia).toHaveFocus())
    expect(avisos.success).toHaveBeenCalledWith("Recibimos tu factura", {
      description: "El equipo de Finanzas la revisará para pagarte.",
    })
    expect(
      screen.queryByRole("form", { name: "Carga tu factura" })
    ).not.toBeInTheDocument()
  })

  it("el error de la BD en el número vuelve a ese campo", async () => {
    carga.elegida = PDF
    acciones.registrarFacturaMedio.mockResolvedValue({
      ok: false,
      error: "Indica el número de la factura.",
      erroresCampo: { numero: ["Indica el número de la factura."] },
    })
    renderizar()
    const numero = screen.getByRole("textbox", { name: "Número de la factura" })
    await userEvent.type(numero, "FE-12")
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar factura" })
    )
    await waitFor(() => expect(numero).toHaveFocus())
    expect(numero).toHaveAccessibleDescription(
      /Indica el número de la factura\./
    )
  })

  it("si el PDF no terminó de subir, lo dice junto al archivo", async () => {
    carga.elegida = PDF
    carga.obtener.mockResolvedValue({
      ok: false,
      error: "El archivo no terminó de subir. Inténtalo de nuevo.",
    })
    renderizar()
    await userEvent.type(
      screen.getByRole("textbox", { name: "Número de la factura" }),
      "FE-12"
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar factura" })
    )
    expect(
      await screen.findByText(
        "El archivo no terminó de subir. Inténtalo de nuevo."
      )
    ).toBeVisible()
    expect(acciones.registrarFacturaMedio).not.toHaveBeenCalled()
  })

  it("con factura registrada: descarga y «Reemplazar factura» mientras no se pague", async () => {
    renderizar({ factura: { numero: "FE-9", conArchivo: true } })
    expect(
      screen.getByRole("button", {
        name: "Tu factura del periodo 1 – 15 oct 2026",
      })
    ).toBeVisible()
    expect(
      screen.queryByRole("textbox", { name: "Número de la factura" })
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Reemplazar factura" })
    )
    expect(
      screen.getByRole("textbox", { name: "Número de la factura" })
    ).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "No reemplazar" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Reemplazar factura" })
      ).toHaveFocus()
    )
  })

  it("pagada: solo la factura, sin formulario", () => {
    renderizar({
      factura: { numero: "FE-9", conArchivo: true },
      puedeCargar: false,
    })
    expect(
      screen.queryByRole("button", { name: "Reemplazar factura" })
    ).not.toBeInTheDocument()
    renderizar({ puedeCargar: false })
    expect(
      screen.getByText("No hay factura registrada para esta liquidación.")
    ).toBeVisible()
  })
})
