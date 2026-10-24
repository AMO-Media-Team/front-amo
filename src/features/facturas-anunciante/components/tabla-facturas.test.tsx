import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { FacturaFila } from "../tipos"

const acciones = vi.hoisted(() => ({
  firmarArchivoFactura: vi.fn(async () => ({
    ok: false as const,
    error: "No encontramos el archivo o no tienes acceso a él.",
  })),
}))
const avisos = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))

vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: avisos }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { TablaFacturas } from "./tabla-facturas"

const CUFE = `3fa94c1b${"0".repeat(82)}9e02d1`

const POR_VENCER: FacturaFila = {
  id: "0199f3a0-0000-7000-8000-00000000f001",
  numero: "FE1042",
  estado: "EMITIDA",
  fechaEmision: "2026-10-01",
  fechaVencimiento: "2026-10-28",
  plazo: { texto: "Vence en 5 días", tono: "aviso", dias: 5 },
  total: 12_400_000,
  saldo: 12_400_000,
  cufe: CUFE,
  tienePdf: true,
  campana: { id: "0199f3a0-0000-7000-8000-0000000c0001", nombre: "Navidad" },
  esDemo: false,
}

const VENCIDA: FacturaFila = {
  ...POR_VENCER,
  id: "0199f3a0-0000-7000-8000-00000000f002",
  numero: "FE1018",
  estado: "VENCIDA",
  fechaVencimiento: "2026-10-11",
  plazo: { texto: "Venció hace 12 días", tono: "peligro", dias: -12 },
  saldo: 4_800_000,
  cufe: null,
  tienePdf: false,
  campana: null,
}

function renderizar(filas: FacturaFila[], conPeriodo = false) {
  render(
    <NuqsTestingAdapter>
      <TablaFacturas
        filas={filas}
        total={filas.length}
        campanas={[{ id: POR_VENCER.campana!.id, nombre: "Navidad" }]}
        conPeriodo={conPeriodo}
      />
    </NuqsTestingAdapter>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("TablaFacturas", () => {
  it("cada fila enlaza a su ficha con estado, vencimiento, saldo, CUFE y PDF", () => {
    renderizar([POR_VENCER, VENCIDA])
    const tabla = screen.getByRole("table", { name: "Facturas de tu empresa" })
    expect(
      within(tabla).getByRole("link", { name: "Factura FE1042" })
    ).toHaveAttribute("href", `/facturas/${POR_VENCER.id}`)

    const [, primera, segunda] = within(tabla).getAllByRole("row")
    expect(primera).toHaveTextContent("Navidad")
    expect(primera).toHaveTextContent("Por pagar")
    expect(primera).toHaveTextContent("Vence en 5 días")
    expect(primera).toHaveTextContent("3fa94c1b…9e02d1")
    expect(
      within(primera).getByRole("button", {
        name: "Copiar el CUFE de la factura FE1042",
      })
    ).toBeVisible()
    expect(
      within(primera).getByRole("button", {
        name: "Descargar el PDF de la factura FE1042",
      })
    ).toBeVisible()

    expect(segunda).toHaveTextContent("Consolidada")
    expect(segunda).toHaveTextContent("Vencida")
    expect(segunda).toHaveTextContent("Venció hace 12 días")
    expect(segunda).toHaveTextContent("Sin CUFE")
    expect(segunda).toHaveTextContent("PDF pendiente")
  })

  it("el PDF se pide al tocarlo; si falta en Storage, lo dice en un aviso", async () => {
    const usuario = userEvent.setup()
    renderizar([POR_VENCER])
    const tabla = screen.getByRole("table", { name: "Facturas de tu empresa" })
    await usuario.click(
      within(tabla).getByRole("button", {
        name: "Descargar el PDF de la factura FE1042",
      })
    )
    expect(acciones.firmarArchivoFactura).toHaveBeenCalledWith({
      tipo: "factura",
      id: POR_VENCER.id,
      descargar: true,
    })
    expect(avisos.error).toHaveBeenCalledWith(
      "No encontramos el archivo o no tienes acceso a él."
    )
  })

  it("copia el CUFE completo", async () => {
    const usuario = userEvent.setup()
    const escribir = vi.spyOn(navigator.clipboard, "writeText")
    renderizar([POR_VENCER])
    const tabla = screen.getByRole("table", { name: "Facturas de tu empresa" })
    await usuario.click(
      within(tabla).getByRole("button", {
        name: "Copiar el CUFE de la factura FE1042",
      })
    )
    expect(escribir).toHaveBeenCalledWith(CUFE)
    expect(within(tabla).getByRole("status")).toHaveTextContent("CUFE copiado")
  })

  it("sin facturas explica qué aparecerá; con fechas, ofrece ver todo el historial", () => {
    renderizar([])
    expect(screen.getByText("Aún no tienes facturas")).toBeVisible()
  })

  it("con un periodo sin resultados, lo dice y ofrece quitarlo", () => {
    renderizar([], true)
    expect(
      screen.getByText("No hay facturas emitidas en esas fechas")
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Ver todo el historial" })
    ).toHaveAttribute("href", "/facturas")
  })
})
