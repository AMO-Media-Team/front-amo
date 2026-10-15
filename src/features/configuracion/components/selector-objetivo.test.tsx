import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, type ResultadoAccion } from "@/lib/result"

import type { ObjetivoComision } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ buscarObjetivosComision: vi.fn() }))
vi.mock("../actions", () => acciones)

import { SelectorObjetivo } from "./selector-objetivo"
import { PAUSA_BUSQUEDA_MS } from "./use-valor-pausado"

const ANUNCIANTE: ObjetivoComision = {
  tipo: "anunciante",
  id: "0190a000-0000-7000-8000-000000000001",
  nombre: "Alimentos del Valle",
  detalle: "NIT 900123456",
}

const CAMPANA: ObjetivoComision = {
  tipo: "campana",
  id: "0190a000-0000-7000-8000-000000000002",
  nombre: "Temporada navideña",
  detalle: "Alimentos del Valle",
}

// La lista de `cmdk` mide su contenido y lleva a la vista el elemento activo.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  acciones.buscarObjetivosComision.mockReset()
})

describe("SelectorObjetivo", () => {
  it("busca al abrir y entrega el objetivo elegido", async () => {
    acciones.buscarObjetivosComision.mockResolvedValue(exito([ANUNCIANTE]))
    const onCambio = vi.fn()
    render(
      <SelectorObjetivo tipo="anunciante" valor={null} onCambio={onCambio} />
    )

    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.click(
      await screen.findByRole("option", { name: /Alimentos del Valle/ })
    )

    expect(acciones.buscarObjetivosComision).toHaveBeenCalledWith({
      objetivo: "anunciante",
      q: "",
    })
    expect(onCambio).toHaveBeenCalledWith(ANUNCIANTE)
  })

  it("no consulta al servidor en cada tecla: espera a que la persona pare", async () => {
    acciones.buscarObjetivosComision.mockResolvedValue(exito([ANUNCIANTE]))
    render(
      <SelectorObjetivo tipo="anunciante" valor={null} onCambio={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("combobox"))
    await screen.findByRole("option", { name: /Alimentos del Valle/ })
    acciones.buscarObjetivosComision.mockClear()

    await userEvent.type(
      screen.getByPlaceholderText(/Nombre o razón social/),
      "valle"
    )

    await waitFor(
      () =>
        expect(acciones.buscarObjetivosComision).toHaveBeenCalledWith({
          objetivo: "anunciante",
          q: "valle",
        }),
      { timeout: PAUSA_BUSQUEDA_MS * 4 }
    )
    expect(acciones.buscarObjetivosComision).toHaveBeenCalledTimes(1)
  })

  it("avisa cuando la lista viene recortada (hay más de los que se muestran)", async () => {
    const muchos = Array.from({ length: 8 }, (_, indice) => ({
      ...ANUNCIANTE,
      id: `0190a000-0000-7000-8000-00000000010${indice}`,
      nombre: `Anunciante ${indice + 1}`,
    }))
    acciones.buscarObjetivosComision.mockResolvedValueOnce(exito(muchos))
    const { unmount } = render(
      <SelectorObjetivo tipo="anunciante" valor={null} onCambio={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("combobox"))
    expect(
      await screen.findByText(/Se muestran los primeros 8/)
    ).toBeInTheDocument()
    unmount()

    // Con menos resultados que el tope no hay nada más que buscar.
    acciones.buscarObjetivosComision.mockResolvedValueOnce(exito([ANUNCIANTE]))
    render(
      <SelectorObjetivo tipo="anunciante" valor={null} onCambio={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("combobox"))
    await screen.findByRole("option", { name: /Alimentos del Valle/ })
    expect(
      screen.queryByText(/Se muestran los primeros/)
    ).not.toBeInTheDocument()
  })

  it("cada apertura empieza sin el texto de la búsqueda anterior", async () => {
    acciones.buscarObjetivosComision.mockResolvedValue(exito([ANUNCIANTE]))
    render(
      <SelectorObjetivo tipo="anunciante" valor={null} onCambio={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("combobox"))
    await userEvent.type(
      screen.getByPlaceholderText(/Nombre o razón social/),
      "valle"
    )
    await waitFor(() =>
      expect(acciones.buscarObjetivosComision).toHaveBeenLastCalledWith({
        objetivo: "anunciante",
        q: "valle",
      })
    )
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/Nombre o razón social/)
      ).not.toBeInTheDocument()
    )

    await userEvent.click(screen.getByRole("combobox"))

    expect(screen.getByPlaceholderText(/Nombre o razón social/)).toHaveValue("")
    await waitFor(() =>
      expect(acciones.buscarObjetivosComision).toHaveBeenLastCalledWith({
        objetivo: "anunciante",
        q: "",
      })
    )
  })

  it("al cambiar de anunciante a campaña no ofrece los resultados del otro tipo", async () => {
    acciones.buscarObjetivosComision.mockResolvedValueOnce(exito([ANUNCIANTE]))
    const { rerender } = render(
      <SelectorObjetivo tipo="anunciante" valor={null} onCambio={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("combobox"))
    await screen.findByRole("option", { name: /Alimentos del Valle/ })
    await userEvent.keyboard("{Escape}")

    // La búsqueda de campañas tarda: mientras tanto no puede quedar el anunciante.
    let resolver: (
      valor: ResultadoAccion<ObjetivoComision[]>
    ) => void = () => {}
    acciones.buscarObjetivosComision.mockReturnValueOnce(
      new Promise<ResultadoAccion<ObjetivoComision[]>>((resolve) => {
        resolver = resolve
      })
    )
    rerender(
      <SelectorObjetivo tipo="campana" valor={null} onCambio={vi.fn()} />
    )
    await userEvent.click(screen.getByRole("combobox"))

    await waitFor(() =>
      expect(acciones.buscarObjetivosComision).toHaveBeenLastCalledWith({
        objetivo: "campana",
        q: "",
      })
    )
    expect(
      screen.queryByRole("option", { name: /Alimentos del Valle/ })
    ).not.toBeInTheDocument()

    resolver(exito([CAMPANA]))
    expect(
      await screen.findByRole("option", { name: /Temporada navideña/ })
    ).toBeInTheDocument()
  })
})
