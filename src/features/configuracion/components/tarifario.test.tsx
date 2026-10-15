import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { Formato, Franja, PermisosConfiguracion, Tarifa } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  validarTarifas: vi.fn(),
  programarTarifa: vi.fn(),
  cancelarTarifaProgramada: vi.fn(),
  historialCambios: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ProveedorConfiguracion } from "./contexto-configuracion"
import { Tarifario } from "./tarifario"

const SOLO_LECTURA: PermisosConfiguracion = {
  editar: false,
  comisiones: false,
  tarifas: false,
  tributario: false,
  catalogos: false,
  verAuditoria: false,
  datosSensibles: false,
}

const F1: Franja = {
  id: "franja-1",
  clave: "F1",
  nombre: "30.000 – 60.000",
  seguidoresMin: 30_000,
  seguidoresMax: 60_000,
  orden: 1,
  activa: true,
  actualizadoAt: "2026-01-01T05:00:00+00:00",
}

const REEL: Formato = {
  id: "formato-1",
  plataforma: "INSTAGRAM",
  clave: "REEL",
  nombre: "Reel",
  requisitos: {
    relacionesAspecto: ["9:16"],
    mime: ["video/mp4"],
    duracionMaxS: 90,
    pesoMaxMb: 50,
    maxArchivos: null,
  },
  activo: true,
  orden: 1,
  actualizadoAt: "2026-01-01T05:00:00+00:00",
}

// Vigente desde 2020 y aún sugerida (pendiente de validación de negocio).
const VIGENTE: Tarifa = {
  id: "tarifa-1",
  formatoId: REEL.id,
  plataforma: "INSTAGRAM",
  franjaId: F1.id,
  valorBase: 350_000,
  vigenteDesde: "2020-01-01T05:00:00+00:00",
  vigenteHasta: null,
  pendienteValidacion: true,
  creadaAt: "2020-01-01T05:00:00+00:00",
  creadaPor: null,
}

function renderizar(permisos: Partial<PermisosConfiguracion> = {}) {
  render(
    <ProveedorConfiguracion permisos={{ ...SOLO_LECTURA, ...permisos }}>
      <Tarifario franjas={[F1]} formatos={[REEL]} tarifas={[VIGENTE]} />
    </ProveedorConfiguracion>
  )
}

/** jsdom no aplica las consultas de contenedor: la celda sale en la tabla y en la ficha móvil. */
function celda() {
  return screen.getAllByRole("button", {
    name: /^Reel, franja 30\.000 – 60\.000: .*350\.000 vigente, pendiente de validación/,
  })[0]
}

describe("Tarifario", () => {
  it("resume la matriz y describe cada celda para lectores de pantalla", () => {
    renderizar()
    expect(
      screen.getByRole("table", {
        name: "Tarifas de Instagram por formato y franja",
      })
    ).toBeInTheDocument()
    expect(celda()).toBeInTheDocument()
    expect(screen.getByText("celdas con tarifa hoy")).toBeInTheDocument()
  })

  it("solo con configuracion.ver: se consulta el historial pero no se programa ni se confirma", async () => {
    const usuario = userEvent.setup()
    renderizar()

    expect(
      screen.queryByRole("button", { name: "Confirmar cifras sugeridas" })
    ).not.toBeInTheDocument()
    // La celda no promete lo que no se puede hacer.
    expect(celda()).toHaveAccessibleName(/Ver historial\.$/)

    await usuario.click(celda())
    const hoja = await screen.findByRole("dialog")
    expect(within(hoja).getByText("Tarifa base")).toBeInTheDocument()
    expect(within(hoja).getByText(/Versiones \(1\)/)).toBeInTheDocument()
    expect(
      within(hoja).queryByRole("button", { name: "Programar tarifa" })
    ).not.toBeInTheDocument()
    expect(
      within(hoja).queryByLabelText("Nueva tarifa base")
    ).not.toBeInTheDocument()
    expect(acciones.programarTarifa).not.toHaveBeenCalled()
  })

  it("con configuracion.tarifas ofrece confirmar las cifras sugeridas y programar una vigencia", async () => {
    const usuario = userEvent.setup()
    renderizar({ tarifas: true })

    expect(
      screen.getByRole("button", { name: "Confirmar cifras sugeridas" })
    ).toBeInTheDocument()
    expect(celda()).toHaveAccessibleName(/Ver historial y programar\.$/)

    await usuario.click(celda())
    const hoja = await screen.findByRole("dialog")
    expect(within(hoja).getByLabelText("Nueva tarifa base")).toBeInTheDocument()
    expect(
      within(hoja).getByRole("button", { name: "Programar tarifa" })
    ).toBeInTheDocument()
  })
})
