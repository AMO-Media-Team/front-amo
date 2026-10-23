import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { MedioExcluido } from "../tipos"

const acciones = vi.hoisted(() => ({
  buscarMediosExcluibles: vi.fn(),
  estimarOferta: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { BuscadorExclusiones, estadoBusqueda } from "./buscador-exclusiones"

const RADIO: MedioExcluido = {
  id: "01a16525-57f2-70b1-9099-844a1b2195e9",
  nombre: "Radio Bogotá",
  municipio: "Bogotá, D.C.",
}
const OTRA: MedioExcluido = {
  id: "01a16525-57f1-7e83-9834-9988509009ab",
  nombre: "Radio Medellín",
  municipio: "Medellín",
}

function Prueba({ inicial = [] }: { inicial?: MedioExcluido[] }) {
  const [valor, setValor] = useState(inicial)
  return (
    <form onSubmit={(evento) => evento.preventDefault()} data-testid="form">
      <BuscadorExclusiones valor={valor} onCambio={setValor} />
    </form>
  )
}

function pintar(inicial?: MedioExcluido[]) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cliente}>
      <Prueba inicial={inicial} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("estadoBusqueda", () => {
  const base = {
    texto: "radio",
    consultado: "radio",
    buscando: false,
    error: null,
    resultados: 2,
  }

  it("guía según lo escrito y lo encontrado", () => {
    expect(estadoBusqueda({ ...base, texto: "" })).toBe("")
    expect(estadoBusqueda({ ...base, texto: "ra" })).toBe(
      "Escribe al menos 3 letras del nombre."
    )
    expect(estadoBusqueda({ ...base, buscando: true })).toBe("Buscando…")
    expect(estadoBusqueda({ ...base, error: "Sin conexión" })).toBe(
      "Sin conexión"
    )
    expect(estadoBusqueda({ ...base, resultados: 0 })).toBe(
      "No encontramos medios verificados con «radio»."
    )
    expect(estadoBusqueda({ ...base, resultados: 1 })).toBe(
      "1 medio encontrado."
    )
    expect(estadoBusqueda(base)).toBe("2 medios encontrados.")
  })
})

describe("BuscadorExclusiones", () => {
  it("busca por nombre público, excluye y muestra el medio como ficha", async () => {
    const usuario = userEvent.setup()
    acciones.buscarMediosExcluibles.mockResolvedValue(exito([RADIO, OTRA]))
    pintar()
    const campo = screen.getByRole("searchbox", {
      name: "Buscar un medio para excluir",
    })
    await usuario.type(campo, "radio")
    expect(await screen.findByText("2 medios encontrados.")).toBeInTheDocument()
    expect(acciones.buscarMediosExcluibles).toHaveBeenCalledWith({
      texto: "radio",
    })
    await usuario.click(
      screen.getByRole("button", { name: "Excluir Radio Bogotá" })
    )
    expect(screen.getByText("1 medio excluido")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Radio Bogotá ya está excluido" })
    ).toHaveAttribute("aria-disabled", "true")
  })

  it("Enter en el buscador no envía el formulario", async () => {
    const usuario = userEvent.setup()
    acciones.buscarMediosExcluibles.mockResolvedValue(exito([]))
    const enviar = vi.fn((evento: SubmitEvent) => evento.preventDefault())
    pintar()
    screen.getByTestId("form").addEventListener("submit", enviar)
    await usuario.type(
      screen.getByRole("searchbox", { name: "Buscar un medio para excluir" }),
      "rad{Enter}"
    )
    expect(enviar).not.toHaveBeenCalled()
  })

  it("con menos de tres letras no consulta y lo explica", async () => {
    const usuario = userEvent.setup()
    pintar()
    await usuario.type(
      screen.getByRole("searchbox", { name: "Buscar un medio para excluir" }),
      "ra"
    )
    expect(
      screen.getByText("Escribe al menos 3 letras del nombre.")
    ).toBeInTheDocument()
    expect(acciones.buscarMediosExcluibles).not.toHaveBeenCalled()
  })

  it("muestra el error de la búsqueda", async () => {
    const usuario = userEvent.setup()
    acciones.buscarMediosExcluibles.mockResolvedValue(
      fallo("No tienes permiso para esta acción.")
    )
    pintar()
    await usuario.type(
      screen.getByRole("searchbox", { name: "Buscar un medio para excluir" }),
      "radio"
    )
    expect(
      await screen.findByText("No tienes permiso para esta acción.")
    ).toBeInTheDocument()
  })

  it("quitar una exclusión devuelve el foco al buscador", async () => {
    const usuario = userEvent.setup()
    pintar([RADIO])
    await usuario.click(
      screen.getByRole("button", {
        name: "Quitar Radio Bogotá de las exclusiones",
      })
    )
    expect(screen.queryByText("1 medio excluido")).toBeNull()
    await waitFor(() =>
      expect(
        screen.getByRole("searchbox", { name: "Buscar un medio para excluir" })
      ).toHaveFocus()
    )
  })
})
