import { render, screen, within } from "@testing-library/react"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { describe, expect, it, vi } from "vitest"

import type { DisputaFila } from "../tipos"

vi.mock("../actions", () => ({ registrarExportacionDisputas: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { TablaDisputas } from "./tabla-disputas"

const AHORA = new Date("2026-10-23T15:00:00Z").getTime()

const ABIERTA: DisputaFila = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000d1",
  estado: "ABIERTA",
  motivo: "OTRO",
  parte: "MEDIO",
  estadoOrigen: "VENCIDA_SIN_PUBLICAR",
  estadoResultante: null,
  creadaAt: "2026-10-21T15:00:00Z",
  resueltaAt: null,
  mensajes: 2,
  asignacionId: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
  medio: "Radio Pasto",
  oferta: "Reel de temporada",
  campana: "Temporada 2026",
  marca: "Café del Huila",
  anunciante: "Café del Huila SAS",
  plataforma: "INSTAGRAM",
}

const CERRADA: DisputaFila = {
  ...ABIERTA,
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000d2",
  estado: "RESUELTA",
  motivo: "METRICAS",
  parte: "ANUNCIANTE",
  estadoOrigen: "METRICAS_CARGADAS",
  estadoResultante: "CANCELADA",
  resueltaAt: "2026-10-22T15:00:00Z",
  medio: null,
  plataforma: null,
}

function renderizar(filas: DisputaFila[]) {
  render(
    <NuqsTestingAdapter>
      <TablaDisputas filas={filas} total={filas.length} ahora={AHORA} />
    </NuqsTestingAdapter>
  )
}

describe("TablaDisputas", () => {
  it("cada fila enlaza a su ficha con el motivo, quién la abrió y el estado", () => {
    renderizar([ABIERTA, CERRADA])
    const tabla = screen.getByRole("table", { name: /Disputas/ })
    const enlace = within(tabla).getByRole("link", { name: "Radio Pasto" })
    expect(enlace).toHaveAttribute("href", `/operacion/disputas/${ABIERTA.id}`)
    const [, fila, cerrada] = within(tabla).getAllByRole("row")
    expect(fila).toHaveTextContent("Otro motivo")
    expect(fila).toHaveTextContent("La abrió: medio")
    expect(fila).toHaveTextContent("Abierta")
    expect(fila).toHaveTextContent("anteayer")
    // Cerrada: el efecto, y la asignación sin datos visibles para el rol.
    expect(cerrada).toHaveTextContent("Resuelta")
    expect(cerrada).toHaveTextContent("Se canceló")
    expect(
      within(cerrada).getByRole("link", { name: "Asignación no visible" })
    ).toBeVisible()
  })

  it("sin disputas explica qué aparecerá", () => {
    renderizar([])
    expect(screen.getByText("No hay disputas")).toBeVisible()
  })
})
