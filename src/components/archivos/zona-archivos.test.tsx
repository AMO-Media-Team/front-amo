import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MIB } from "@/lib/archivos/formato"
import type { ReglasArchivo } from "@/lib/archivos/validar"

import { ZonaArchivos } from "./zona-archivos"

const REGLAS: ReglasArchivo = {
  mimes: ["image/jpeg", "image/png"],
  maxBytes: MIB,
}

function archivo(nombre: string, tipo: string, tamano = 10) {
  return new File([new Uint8Array(tamano)], nombre, { type: tipo })
}

function elegir(contenedor: HTMLElement, archivos: File[]) {
  const input = contenedor.querySelector<HTMLInputElement>(
    'input[type="file"]:not([capture])'
  )
  if (!input) throw new Error("Sin input de archivos")
  fireEvent.change(input, { target: { files: archivos } })
}

describe("ZonaArchivos", () => {
  it("se presenta con sus formatos y límites", () => {
    render(<ZonaArchivos reglas={REGLAS} onArchivos={vi.fn()} />)
    const grupo = screen.getByRole("group", { name: /Sube tu archivo/ })
    expect(grupo).toHaveAccessibleDescription(/JPG o PNG · hasta 1\sMB/)
    expect(
      screen.getByRole("button", { name: "Elegir archivo" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Tomar foto" })).toBeNull()
  })

  it("entrega los archivos válidos", async () => {
    const onArchivos = vi.fn()
    const { container } = render(
      <ZonaArchivos reglas={REGLAS} onArchivos={onArchivos} />
    )
    const foto = archivo("foto.png", "image/png")
    elegir(container, [foto])
    await waitFor(() => expect(onArchivos).toHaveBeenCalledWith([foto]))
    expect(screen.queryByRole("listitem")).toBeNull()
  })

  it("explica por qué rechaza un archivo y no lo entrega", async () => {
    const onArchivos = vi.fn()
    const { container } = render(
      <ZonaArchivos reglas={REGLAS} onArchivos={onArchivos} />
    )
    elegir(container, [archivo("grande.jpg", "image/jpeg", 2 * MIB)])
    expect(
      await screen.findByText(/El archivo pesa 2\sMB y el máximo es 1\sMB\./)
    ).toBeInTheDocument()
    expect(screen.getByText(/grande\.jpg/)).toBeInTheDocument()
    expect(onArchivos).not.toHaveBeenCalled()
  })

  it("rechaza el formato con los admitidos", async () => {
    const { container } = render(
      <ZonaArchivos reglas={REGLAS} onArchivos={vi.fn()} />
    )
    elegir(container, [archivo("contrato.pdf", "application/pdf")])
    expect(
      await screen.findByText(
        "Este formato no se admite. Sube un archivo JPG o PNG."
      )
    ).toBeInTheDocument()
  })

  it("con un solo archivo permitido toma el primero y avisa", async () => {
    const onArchivos = vi.fn()
    const { container } = render(
      <ZonaArchivos reglas={REGLAS} onArchivos={onArchivos} />
    )
    const primero = archivo("a.png", "image/png")
    elegir(container, [primero, archivo("b.png", "image/png")])
    expect(
      await screen.findByText("Elige un solo archivo: se tomó el primero.")
    ).toBeInTheDocument()
    expect(onArchivos).toHaveBeenCalledWith([primero])
  })

  it("ofrece la cámara del celular cuando se pide", () => {
    const { container } = render(
      <ZonaArchivos
        reglas={REGLAS}
        onArchivos={vi.fn()}
        capture="environment"
      />
    )
    expect(
      screen.getByRole("button", { name: "Tomar foto" })
    ).toBeInTheDocument()
    const camara = container.querySelector<HTMLInputElement>("input[capture]")
    expect(camara).toHaveAttribute("capture", "environment")
    expect(camara?.accept).toBe("image/jpeg,.jpg,.jpeg,image/png,.png")
  })
})
