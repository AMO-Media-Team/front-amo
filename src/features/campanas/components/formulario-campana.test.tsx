import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { CAMPANA_DESACTUALIZADA } from "../errores"
import { reglasEdicion, reglasNuevaCampana } from "../formularios"
import type { MiCampana } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  crearCampana: vi.fn(),
  editarCampana: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import {
  FormularioEditarCampana,
  FormularioNuevaCampana,
} from "./formulario-campana"

const HOY = "2026-10-22"

const CAMPANA: MiCampana = {
  id: "0199f3a0-0000-7000-8000-00000000ca01",
  nombre: "Temporada navideña 2026",
  marca: "Café Sierra Alta",
  objetivo: "Dar a conocer la nueva presentación.",
  anuncianteId: "0199f3a0-0000-7000-8000-00000000a001",
  estado: "ACTIVA",
  fechaInicio: "2026-10-01",
  fechaFin: "2026-12-31",
  presupuestoTotal: 25_000_000,
  presupuestoComprometido: 1_200_000,
  disponible: 15_000_000,
  activadaAt: "2026-10-01T15:00:00Z",
  finalizadaAt: null,
  canceladaAt: null,
  creadaAt: "2026-09-28T15:00:00Z",
  actualizadaAt: "2026-10-21T15:00:00.123456+00:00",
  esDemo: false,
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

function pintarEdicion() {
  return render(
    <FormularioEditarCampana
      campana={CAMPANA}
      reglas={reglasEdicion(CAMPANA, [], HOY)}
    />
  )
}

describe("FormularioNuevaCampana", () => {
  it("valida antes de enviar y marca cada campo que falta", async () => {
    const usuario = userEvent.setup()
    render(<FormularioNuevaCampana reglas={reglasNuevaCampana(HOY)} />)

    await usuario.click(screen.getByRole("button", { name: "Crear campaña" }))

    expect(
      await screen.findByText("Escribe el nombre de la campaña.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Nombre de la campaña")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(
      screen.getByText(
        "Escribe la marca o el producto que promociona la campaña."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("Elige la fecha de inicio.")).toBeInTheDocument()
    expect(screen.getByText("Elige la fecha de fin.")).toBeInTheDocument()
    expect(
      screen.getByText("Escribe el presupuesto total de la campaña.")
    ).toBeInTheDocument()
    expect(acciones.crearCampana).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/campanas"
    )
  })
})

describe("FormularioEditarCampana", () => {
  it("carga lo guardado y explica el piso del presupuesto", () => {
    pintarEdicion()
    expect(screen.getByLabelText("Nombre de la campaña")).toHaveValue(
      CAMPANA.nombre
    )
    expect(screen.getByLabelText("Presupuesto total")).toHaveValue("25.000.000")
    expect(
      screen.getByText(/No puede quedar por debajo de \$\s10\.000\.000/)
    ).toBeInTheDocument()
    expect(screen.getByText(/La campaña dura/)).toHaveTextContent(
      "La campaña dura 92 días."
    )
  })

  it("no deja bajar el presupuesto de lo comprometido", async () => {
    const usuario = userEvent.setup()
    pintarEdicion()
    const presupuesto = screen.getByLabelText("Presupuesto total")
    await usuario.clear(presupuesto)
    await usuario.type(presupuesto, "9.000.000")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(
      await screen.findByText(/^El presupuesto no puede quedar por debajo de/)
    ).toBeInTheDocument()
    expect(presupuesto).toHaveAttribute("aria-invalid", "true")
    expect(acciones.editarCampana).not.toHaveBeenCalled()
  })

  it("envía lo escrito con la versión del registro y vuelve a la ficha", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      exito({ actualizadoAt: "2026-10-22T15:00:00Z" })
    )
    pintarEdicion()
    const nombre = screen.getByLabelText("Nombre de la campaña")
    await usuario.clear(nombre)
    await usuario.type(nombre, "Navidad en la costa")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() => expect(acciones.editarCampana).toHaveBeenCalledTimes(1))
    expect(acciones.editarCampana.mock.calls[0][0]).toEqual({
      campanaId: CAMPANA.id,
      actualizadoAt: CAMPANA.actualizadaAt,
      nombre: "Navidad en la costa",
      marca: CAMPANA.marca,
      objetivo: CAMPANA.objetivo,
      fechaInicio: "2026-10-01",
      fechaFin: "2026-12-31",
      presupuesto: "25.000.000",
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Guardamos los cambios de la campaña"
    )
    expect(enrutador.push).toHaveBeenCalledWith(`/campanas/${CAMPANA.id}`)
  })

  it("sin cambios no dice que guardó", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      exito({ actualizadoAt: CAMPANA.actualizadaAt })
    )
    pintarEdicion()
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await waitFor(() =>
      expect(avisos.info).toHaveBeenCalledWith("No había cambios que guardar")
    )
    expect(avisos.success).not.toHaveBeenCalled()
    expect(enrutador.push).toHaveBeenCalledWith(`/campanas/${CAMPANA.id}`)
  })

  it("un error del servidor en el presupuesto va a su campo", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(
      fallo("La campaña no tiene presupuesto disponible para este cambio.", {
        presupuesto: [
          "La campaña no tiene presupuesto disponible para este cambio.",
        ],
      })
    )
    pintarEdicion()
    await usuario.type(screen.getByLabelText("Marca o producto"), " Premium")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    expect(
      await screen.findByText(
        "La campaña no tiene presupuesto disponible para este cambio."
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Presupuesto total")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(enrutador.push).not.toHaveBeenCalled()
  })

  it("si un compañero guardó antes, ofrece cargar lo vigente", async () => {
    const usuario = userEvent.setup()
    acciones.editarCampana.mockResolvedValue(fallo(CAMPANA_DESACTUALIZADA))
    pintarEdicion()
    await usuario.type(screen.getByLabelText("Marca o producto"), " Premium")
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }))

    await usuario.click(
      await screen.findByRole("button", { name: "Cargar los datos vigentes" })
    )
    expect(enrutador.refresh).toHaveBeenCalledTimes(1)
  })
})
