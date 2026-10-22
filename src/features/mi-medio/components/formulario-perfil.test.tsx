import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { PERFIL_DESACTUALIZADO } from "../errores"
import { medioFijo } from "../fixtures"
import type { PerfilEditable } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ guardarPerfilMedio: vi.fn() }))
vi.mock("../actions", () => acciones)
const territorio = vi.hoisted(() => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => territorio)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { FormularioPerfilMedio } from "./formulario-perfil"

const CATEGORIA = "0199f3a0-0000-7000-8000-0000000000c1"

const PERFIL: PerfilEditable = {
  medio: medioFijo({ descripcionAudiencia: null }),
  categoriaIds: [CATEGORIA],
  categorias: [
    { id: CATEGORIA, nombre: "Noticias" },
    { id: "0199f3a0-0000-7000-8000-0000000000c2", nombre: "Deportes" },
  ],
  audiencia: [],
  audienciaVerificada: [],
  audienciaFija: { paises: [], porcentaje: 0 },
  paises: [
    { codigo: "CO", nombre: "Colombia" },
    { codigo: "US", nombre: "Estados Unidos" },
  ],
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
  territorio.listarDepartamentosActivos.mockResolvedValue(
    exito([
      {
        codigo: "76",
        nombre: "Valle del Cauca",
        nombreCorto: "Valle",
        region: "Pacífica",
      },
    ])
  )
  territorio.listarMunicipiosActivos.mockResolvedValue(
    exito([
      {
        codigo: "76001",
        nombre: "Cali",
        departamentoCodigo: "76",
        esCapital: true,
      },
    ])
  )
})

function pintar(perfil: PerfilEditable = PERFIL) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cliente}>
      <FormularioPerfilMedio perfil={perfil} />
    </QueryClientProvider>
  )
}

const DESCRIPCION = "Jóvenes del sur de Cali que siguen el fútbol local."

describe("FormularioPerfilMedio", () => {
  it("carga lo guardado y solo ofrece guardar cuando hay cambios", () => {
    pintar()
    expect(screen.getByLabelText("Nombre del medio")).toHaveValue(
      "Noticias del Sur"
    )
    expect(screen.getByRole("checkbox", { name: "Noticias" })).toBeChecked()
    expect(
      screen.queryByRole("region", { name: "Cambios sin guardar" })
    ).toBeNull()
  })

  it("envía lo escrito con la versión del registro y confirma", async () => {
    const usuario = userEvent.setup()
    acciones.guardarPerfilMedio.mockResolvedValue(
      exito({ actualizadoAt: "2026-10-22T13:00:00Z", advertencia: null })
    )
    pintar()

    await usuario.type(
      screen.getByLabelText("Describe a tu audiencia"),
      DESCRIPCION
    )
    await usuario.click(screen.getByRole("button", { name: "Guardar perfil" }))

    await waitFor(() =>
      expect(acciones.guardarPerfilMedio).toHaveBeenCalledTimes(1)
    )
    expect(acciones.guardarPerfilMedio.mock.calls[0][0]).toMatchObject({
      actualizadoAt: PERFIL.medio.actualizadoAt,
      descripcionAudiencia: DESCRIPCION,
      categoriaIds: [CATEGORIA],
      audiencia: [],
    })
    expect(avisos.success).toHaveBeenCalledWith("Perfil guardado")
  })

  it("avisa si se guardó lo principal pero no algo secundario", async () => {
    const usuario = userEvent.setup()
    acciones.guardarPerfilMedio.mockResolvedValue(
      exito({
        actualizadoAt: "x",
        advertencia: "No se guardaron las categorías.",
      })
    )
    pintar()
    await usuario.click(screen.getByRole("checkbox", { name: "Deportes" }))
    await usuario.click(screen.getByRole("button", { name: "Guardar perfil" }))
    await waitFor(() =>
      expect(avisos.warning).toHaveBeenCalledWith(
        "No se guardaron las categorías."
      )
    )
  })

  it("si otra edición ganó, ofrece cargar los datos vigentes", async () => {
    const usuario = userEvent.setup()
    acciones.guardarPerfilMedio.mockResolvedValue(fallo(PERFIL_DESACTUALIZADO))
    pintar()

    await usuario.type(screen.getByLabelText("Describe a tu audiencia"), "x")
    await usuario.click(screen.getByRole("button", { name: "Guardar perfil" }))
    await usuario.click(
      await screen.findByRole("button", { name: "Cargar los datos vigentes" })
    )
    expect(enrutador.refresh).toHaveBeenCalledTimes(1)
  })

  it("la audiencia por país no deja pasar de 100 %", async () => {
    const usuario = userEvent.setup()
    pintar()

    await usuario.click(screen.getByRole("button", { name: "Agregar un país" }))
    await usuario.type(
      screen.getByLabelText("Porcentaje de la audiencia en el país 1"),
      "120"
    )
    await usuario.click(screen.getByRole("button", { name: "Guardar perfil" }))

    expect(
      await screen.findByText("No puede pasar de 100 %.")
    ).toBeInTheDocument()
    expect(acciones.guardarPerfilMedio).not.toHaveBeenCalled()
  })
})
