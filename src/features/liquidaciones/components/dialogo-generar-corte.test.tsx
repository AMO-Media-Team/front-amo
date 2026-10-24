import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { MENSAJES_PERIODO } from "../schemas"
import type { MedioCorte } from "../tipos"

const acciones = vi.hoisted(() => ({ generarCorte: vi.fn() }))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { DialogoGenerarCorte } from "./dialogo-generar-corte"

const HOY = "2026-10-23"
const LIQ = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const MEDIOS: MedioCorte[] = [
  {
    medioId: "m1",
    primeraVerificada: "2026-10-02T15:00:00Z",
    ultimaLiquidacionFin: null,
  },
  {
    medioId: "m2",
    primeraVerificada: "2026-10-10T15:00:00Z",
    ultimaLiquidacionFin: "2026-10-15",
  },
  {
    medioId: "m3",
    primeraVerificada: "2026-10-20T15:00:00Z",
    ultimaLiquidacionFin: null,
  },
]

beforeEach(() => {
  acciones.generarCorte.mockReset()
  avisos.success.mockReset()
})

async function abrir(medios: MedioCorte[] = MEDIOS) {
  const usuario = userEvent.setup()
  render(
    <DialogoGenerarCorte
      sugerido={{
        inicio: "2026-10-01",
        fin: "2026-10-15",
        periodicidad: "QUINCENAL",
      }}
      medios={medios}
      hoy={HOY}
    />
  )
  await usuario.click(screen.getByRole("button", { name: "Generar corte" }))
  const dialogo = await screen.findByRole("dialog", {
    name: "Generar el corte",
  })
  return { usuario, dialogo }
}

describe("DialogoGenerarCorte (LIQ-001)", () => {
  it("propone el último periodo cerrado y dice cuántos medios entran", async () => {
    const { dialogo } = await abrir()
    expect(within(dialogo).getByLabelText("Primer día")).toHaveValue(
      "2026-10-01"
    )
    expect(within(dialogo).getByLabelText("Último día")).toHaveValue(
      "2026-10-15"
    )
    expect(
      within(dialogo).getByText(/Liquidación quincenal/)
    ).toBeInTheDocument()
    expect(within(dialogo).getByText("2 medios entran")).toBeInTheDocument()
    expect(
      within(dialogo).getByText(/1 ya tiene una liquidación en esas fechas/)
    ).toBeInTheDocument()
  })

  it("un último día después de hoy se marca en su campo y no llama a la acción", async () => {
    const { usuario, dialogo } = await abrir()
    const fin = within(dialogo).getByLabelText("Último día")
    fireEvent.change(fin, { target: { value: "2026-10-31" } })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Generar corte" })
    )
    expect(fin).toHaveAttribute("aria-invalid", "true")
    expect(fin).toHaveAccessibleDescription(
      new RegExp(MENSAJES_PERIODO.abierto.slice(0, 20))
    )
    expect(acciones.generarCorte).not.toHaveBeenCalled()
  })

  it("muestra el resultado por medio, con enlace a cada liquidación creada", async () => {
    acciones.generarCorte.mockResolvedValue(
      exito([
        {
          medioId: "m1",
          medio: "Radio Pasto",
          liquidacionId: LIQ,
          error: null,
        },
        {
          medioId: "m2",
          medio: "Noticias del Sur",
          liquidacionId: null,
          error: "Ya hay una liquidación del medio que cubre ese periodo.",
        },
      ])
    )
    const { usuario, dialogo } = await abrir()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Generar corte" })
    )
    expect(acciones.generarCorte).toHaveBeenCalledWith({
      inicio: "2026-10-01",
      fin: "2026-10-15",
    })
    const titulo = await screen.findByRole("heading", { name: /^Corte del / })
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(
      screen.getByText("Se generó 1 liquidación; 1 medio quedó por fuera.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver la liquidación de Radio Pasto" })
    ).toHaveAttribute("href", `/finanzas/liquidaciones/${LIQ}`)
    expect(
      screen.getByText(
        "Ya hay una liquidación del medio que cubre ese periodo."
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver por aprobar" })
    ).toHaveAttribute("href", "/finanzas/liquidaciones?vista=borrador")
  })

  it("un error de la BD en el periodo vuelve a su campo; otro, como alerta", async () => {
    acciones.generarCorte.mockResolvedValueOnce(
      fallo("El periodo no ha cerrado.", { fin: ["El periodo no ha cerrado."] })
    )
    const { usuario, dialogo } = await abrir()
    const generar = within(dialogo).getByRole("button", {
      name: "Generar corte",
    })
    await usuario.click(generar)
    expect(
      await within(dialogo).findByText("El periodo no ha cerrado.")
    ).toBeInTheDocument()
    expect(within(dialogo).getByLabelText("Último día")).toHaveAttribute(
      "aria-invalid",
      "true"
    )

    acciones.generarCorte.mockResolvedValueOnce(fallo("Sin conexión."))
    await usuario.click(generar)
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Sin conexión."
    )
  })

  it("sin medios por liquidar, el botón explica por qué no se puede y sigue enfocable", async () => {
    render(
      <DialogoGenerarCorte
        sugerido={{
          inicio: "2026-10-01",
          fin: "2026-10-15",
          periodicidad: "QUINCENAL",
        }}
        medios={[]}
        hoy={HOY}
      />
    )
    const boton = screen.getByRole("button", { name: "Generar corte" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(
      "No hay medios con asignaciones verificadas por liquidar."
    )
    // Tras un corte que liquida a todos, el foco vuelve aquí al cerrar.
    boton.focus()
    expect(boton).toHaveFocus()
    await userEvent.setup().click(boton)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
