import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactNode, useState } from "react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  DepartamentoActivo,
  MunicipioActivo,
  Segmentacion,
} from "@/features/territorio/tipos"
import { exito, fallo } from "@/lib/result"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => acciones)

import { SelectorTerritorio } from "./selector-territorio"

const DEPARTAMENTOS: DepartamentoActivo[] = [
  {
    codigo: "05",
    nombre: "Antioquia",
    nombreCorto: "Antioquia",
    region: "Andina",
  },
  {
    codigo: "08",
    nombre: "Atlántico",
    nombreCorto: "Atlántico",
    region: "Caribe",
  },
]

const MUNICIPIOS: Record<string, MunicipioActivo[]> = {
  "05": [
    {
      codigo: "05001",
      nombre: "Medellín",
      departamentoCodigo: "05",
      esCapital: true,
    },
    {
      codigo: "05266",
      nombre: "Envigado",
      departamentoCodigo: "05",
      esCapital: false,
    },
  ],
  "08": [
    {
      codigo: "08001",
      nombre: "Barranquilla",
      departamentoCodigo: "08",
      esCapital: true,
    },
  ],
}

// `cmdk` mide su contenido y lleva a la vista el elemento activo.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  acciones.listarDepartamentosActivos.mockReset()
  acciones.listarMunicipiosActivos.mockReset()
  acciones.listarDepartamentosActivos.mockResolvedValue(exito(DEPARTAMENTOS))
  acciones.listarMunicipiosActivos.mockImplementation((departamento: string) =>
    Promise.resolve(exito(MUNICIPIOS[departamento] ?? []))
  )
})

function conConsultas(contenido: ReactNode) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={cliente}>{contenido}</QueryClientProvider>
}

describe("SelectorTerritorio · municipio", () => {
  it("muestra el municipio guardado con su departamento", async () => {
    render(
      conConsultas(
        <SelectorTerritorio modo="municipio" valor="05001" onCambio={vi.fn()} />
      )
    )
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Municipio" })
      ).toHaveTextContent("Medellín")
    )
    expect(
      screen.getByRole("combobox", { name: "Departamento" })
    ).toHaveTextContent("Antioquia")
  })

  it("elegir el departamento abre sus municipios y se entrega el elegido", async () => {
    const usuario = userEvent.setup()
    const onCambio = vi.fn()
    render(
      conConsultas(
        <SelectorTerritorio modo="municipio" valor={null} onCambio={onCambio} />
      )
    )
    expect(screen.getByRole("combobox", { name: "Municipio" })).toBeDisabled()

    await usuario.click(screen.getByRole("combobox", { name: "Departamento" }))
    await usuario.click(
      await screen.findByRole("option", { name: /Atlántico/ })
    )

    // La lista de municipios se abre sola, con el foco en su buscador.
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Busca un municipio…" })
      ).toHaveFocus()
    )
    await usuario.click(
      await screen.findByRole("option", { name: /Barranquilla/ })
    )
    expect(acciones.listarMunicipiosActivos).toHaveBeenCalledWith("08")
    expect(onCambio).toHaveBeenCalledWith(MUNICIPIOS["08"][0])
  })

  it("con la lista abierta, aria-controls apunta al listbox que existe", async () => {
    const usuario = userEvent.setup()
    render(
      conConsultas(
        <SelectorTerritorio modo="municipio" valor={null} onCambio={vi.fn()} />
      )
    )
    const disparador = screen.getByRole("combobox", { name: "Departamento" })
    expect(disparador).not.toHaveAttribute("aria-controls")

    await usuario.click(disparador)
    await screen.findByRole("option", { name: /Antioquia/ })
    const lista = screen.getByRole("listbox")
    // cmdk pone su propio id a la lista: el disparador debe usar ese.
    expect(lista.id).not.toBe("")
    expect(disparador).toHaveAttribute("aria-controls", lista.id)

    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(disparador).not.toHaveAttribute("aria-controls"))
  })

  it("avisa si el municipio guardado ya no está activo", async () => {
    render(
      conConsultas(
        <SelectorTerritorio modo="municipio" valor="05999" onCambio={vi.fn()} />
      )
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El municipio guardado ya no está activo en AMO. Elige otro."
    )
    expect(screen.getByRole("combobox", { name: "Municipio" })).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  })

  it("si la lista no carga (tras un reintento automático), lo dice y permite reintentar", async () => {
    const usuario = userEvent.setup()
    const error = fallo(
      "No pudimos cargar los departamentos. Intenta de nuevo en unos segundos."
    )
    acciones.listarDepartamentosActivos
      .mockResolvedValueOnce(error)
      .mockResolvedValueOnce(error)
    render(
      conConsultas(
        <SelectorTerritorio modo="municipio" valor={null} onCambio={vi.fn()} />
      )
    )
    await usuario.click(screen.getByRole("combobox", { name: "Departamento" }))
    const alerta = await screen.findByRole("alert", {}, { timeout: 3_000 })
    expect(alerta).toHaveTextContent("No pudimos cargar los departamentos.")
    // Fuera del listbox: dentro solo caben opciones.
    expect(alerta.closest("[role='listbox']")).toBeNull()
    expect(acciones.listarDepartamentosActivos).toHaveBeenCalledTimes(2)
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(
      await screen.findByRole("option", { name: /Antioquia/ })
    ).toBeVisible()
  })
})

function Segmentador({ inicial }: { inicial: Segmentacion }) {
  const [valor, setValor] = useState(inicial)
  return (
    <SelectorTerritorio modo="segmentacion" valor={valor} onCambio={setValor} />
  )
}

describe("SelectorTerritorio · segmentación", () => {
  it("vacía explica que llega a todo el país", () => {
    render(
      conConsultas(
        <Segmentador inicial={{ departamentos: [], municipios: [] }} />
      )
    )
    expect(screen.getByText("Todo el país")).toBeInTheDocument()
    expect(screen.getByText(/Sin restricción geográfica/)).toBeInTheDocument()
  })

  it("agrega un departamento completo y municipios sueltos como fichas", async () => {
    const usuario = userEvent.setup()
    render(
      conConsultas(
        <Segmentador inicial={{ departamentos: [], municipios: [] }} />
      )
    )
    const agregar = screen.getByRole("button", {
      name: /Agregar departamento o municipio/,
    })

    await usuario.click(agregar)
    await usuario.click(
      await screen.findByRole("option", { name: /Atlántico/ })
    )
    await usuario.click(
      await screen.findByRole("option", { name: /Todo Atlántico/ })
    )
    await usuario.click(
      screen.getByRole("option", { name: /Todos los departamentos/ })
    )
    await usuario.click(
      await screen.findByRole("option", { name: /Antioquia/ })
    )
    await usuario.click(await screen.findByRole("option", { name: /Envigado/ }))
    await usuario.keyboard("{Escape}")

    const fichas = within(
      screen.getByRole("list", { name: "Territorio elegido" })
    )
    expect(fichas.getAllByRole("listitem")).toHaveLength(2)
    expect(fichas.getByText("Atlántico")).toBeInTheDocument()
    expect(fichas.getByText("Envigado")).toBeInTheDocument()
    expect(
      screen.getByText("1 departamento completo y 1 municipio")
    ).toBeInTheDocument()
  })

  it("dentro de un departamento, la lista solo contiene opciones", async () => {
    const usuario = userEvent.setup()
    render(
      conConsultas(
        <Segmentador inicial={{ departamentos: ["05"], municipios: [] }} />
      )
    )
    await usuario.click(
      screen.getByRole("button", { name: /Agregar departamento o municipio/ })
    )
    await usuario.click(
      await screen.findByRole("option", { name: /Antioquia/ })
    )
    expect(
      screen.getByRole("combobox", {
        name: "Busca un municipio de Antioquia…",
      })
    ).toBeInTheDocument()
    const lista = await screen.findByRole("listbox")
    const todo = within(lista).getByRole("option", { name: /Todo Antioquia/ })
    expect(todo).toHaveAttribute("aria-checked", "true")
    expect(within(lista).queryByRole("separator")).toBeNull()
    // La explicación de «departamento completo» va junto a la lista, no dentro.
    const explicacion = screen.getByText(/Incluye todos sus municipios/)
    expect(lista).not.toContainElement(explicacion)
  })

  it("«Mostrar N más» despliega las fichas y se pliega con el mismo botón", async () => {
    const usuario = userEvent.setup()
    const municipios = Array.from(
      { length: 14 },
      (_, indice) => `05${String(indice + 1).padStart(3, "0")}`
    )
    render(
      conConsultas(<Segmentador inicial={{ departamentos: [], municipios }} />)
    )
    const fichas = within(
      screen.getByRole("list", { name: "Territorio elegido" })
    )
    const mostrar = fichas.getByRole("button", { name: "Mostrar 2 más" })
    expect(mostrar).toHaveAttribute("aria-expanded", "false")
    await usuario.click(mostrar)
    expect(mostrar).toHaveAccessibleName("Mostrar menos")
    expect(mostrar).toHaveAttribute("aria-expanded", "true")
    expect(mostrar).toHaveFocus()
    expect(fichas.getAllByRole("button", { name: /^Quitar/ })).toHaveLength(14)
  })

  it("quita una ficha y devuelve el foco a «Agregar»", async () => {
    const usuario = userEvent.setup()
    render(
      conConsultas(
        <Segmentador
          inicial={{ departamentos: ["08"], municipios: ["05001"] }}
        />
      )
    )
    const quitar = await screen.findByRole("button", {
      name: "Quitar Medellín",
    })
    await usuario.click(quitar)
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Agregar departamento o municipio/ })
      ).toHaveFocus()
    )
    expect(screen.getByText("1 departamento completo")).toBeInTheDocument()
  })
})
