import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { formatearPorcentaje } from "@/lib/format"

import { ListaSubidas } from "./lista-subidas"
import { INSTANTANEA_INICIAL } from "./motor-subida"
import type { ElementoSubida } from "./use-subidas"

function elemento(cambios: Partial<ElementoSubida>): ElementoSubida {
  return {
    ...INSTANTANEA_INICIAL,
    id: "1",
    nombre: "captura.webp",
    tamano: 850 * 1024,
    tipo: "image/webp",
    vistaPrevia: null,
    resultado: null,
    ...cambios,
  }
}

describe("ListaSubidas", () => {
  it("no pinta nada sin archivos", () => {
    const { container } = render(<ListaSubidas elementos={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("muestra el progreso de una subida en curso y permite cancelarla", async () => {
    const onCancelar = vi.fn()
    render(
      <ListaSubidas
        elementos={[elemento({ estado: "subiendo", progreso: 0.5 })]}
        onCancelar={onCancelar}
        onQuitar={vi.fn()}
        onReintentar={vi.fn()}
      />
    )
    expect(screen.getByRole("list", { name: "Archivos" })).toBeInTheDocument()
    expect(screen.getByText("captura.webp")).toBeInTheDocument()
    expect(
      screen.getByText(`Subiendo… ${formatearPorcentaje(0.5, 0)}`)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("progressbar", { name: "Progreso de captura.webp" })
    ).toHaveAttribute("aria-valuenow", "50")
    // En curso no se quita ni se reintenta: se cancela.
    expect(screen.queryByRole("button", { name: /Quitar/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull()

    await userEvent.click(
      screen.getByRole("button", { name: "Cancelar la subida de captura.webp" })
    )
    expect(onCancelar).toHaveBeenCalledWith("1")
  })

  it("un error muestra su causa y ofrece reintentar o quitar", async () => {
    const onReintentar = vi.fn()
    const onQuitar = vi.fn()
    render(
      <ListaSubidas
        elementos={[
          elemento({
            estado: "error",
            error: "No tienes permiso para subir archivos aquí.",
          }),
        ]}
        onReintentar={onReintentar}
        onQuitar={onQuitar}
        onCancelar={vi.fn()}
      />
    )
    expect(
      screen.getAllByText(/No tienes permiso para subir archivos aquí/)
    ).not.toHaveLength(0)
    expect(screen.queryByRole("progressbar")).toBeNull()
    await userEvent.click(
      screen.getByRole("button", { name: "Reintentar captura.webp" })
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Quitar captura.webp" })
    )
    expect(onReintentar).toHaveBeenCalledWith("1")
    expect(onQuitar).toHaveBeenCalledWith("1")
  })

  it("anuncia los hitos y explica la pausa sin conexión", () => {
    render(
      <ListaSubidas
        elementos={[
          elemento({ id: "1", estado: "completada", progreso: 1 }),
          elemento({
            id: "2",
            nombre: "video.mp4",
            tipo: "video/mp4",
            estado: "pausada",
          }),
        ]}
      />
    )
    expect(screen.getByText("Listo")).toBeInTheDocument()
    expect(screen.getByText("captura.webp: subido.")).toBeInTheDocument()
    expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
  })

  it("cuenta los segundos del próximo reintento", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    vi.setSystemTime(new Date("2026-10-21T12:00:00Z"))
    try {
      render(
        <ListaSubidas
          elementos={[
            elemento({
              estado: "reintentando",
              intento: 1,
              reanudaEn: Date.now() + 8_000,
            }),
          ]}
        />
      )
      expect(
        screen.getByText("Falló la conexión. Reintento 1 de 4 en 8 s")
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
