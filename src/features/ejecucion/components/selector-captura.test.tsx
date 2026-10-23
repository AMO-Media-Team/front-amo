import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import type { CargaCaptura } from "@/components/archivos/use-carga-captura"

import { SelectorCaptura } from "./selector-captura"

function carga(cambios: Partial<CargaCaptura> = {}): CargaCaptura {
  return {
    subida: {
      estado: "en-cola",
      progreso: 0,
      error: null,
      intento: 0,
      reanudaEn: null,
      subir: vi.fn(),
      reintentar: vi.fn(),
      cancelar: vi.fn(),
      reiniciar: vi.fn(),
      activa: false,
    },
    elegida: null,
    vistaPrevia: null,
    lista: null,
    elemento: null,
    elegir: vi.fn(),
    descartar: vi.fn(),
    reintentar: vi.fn(),
    obtener: vi.fn(),
    ...cambios,
  }
}

const BASE = {
  titulo: "Toma o elige la captura",
  instrucciones: "Imagen JPG, PNG, WebP o HEIC.",
  descripcionVista: "Vista previa",
  idError: "error-captura",
}

const PANEL = new File(["x"], "panel.png", { type: "image/png" })

/** El selector con una captura que se elige y se descarta de verdad. */
function ConCaptura({
  inicial = null,
  conError = false,
}: {
  inicial?: File | null
  conError?: boolean
}) {
  const [elegida, setElegida] = useState<File | null>(inicial)
  return (
    <>
      <label>
        Otro campo
        <input />
      </label>
      <SelectorCaptura
        {...BASE}
        carga={carga({
          elegida,
          elegir: setElegida,
          descartar: () => setElegida(null),
          ...(conError
            ? {
                elemento: {
                  id: "captura",
                  nombre: PANEL.name,
                  tamano: PANEL.size,
                  tipo: PANEL.type,
                  vistaPrevia: null,
                  resultado: null,
                  estado: "error",
                  progreso: 0,
                  error: "No se pudo subir.",
                  intento: 1,
                  reanudaEn: null,
                },
              }
            : {}),
        })}
      />
    </>
  )
}

describe("SelectorCaptura", () => {
  it("ofrece la cámara y la galería, y asocia el error a la zona", () => {
    render(
      <SelectorCaptura
        {...BASE}
        carga={carga()}
        error="Carga la captura del panel de estadísticas, con la fecha visible."
      />
    )
    expect(screen.getByRole("button", { name: /foto/i })).toBeInTheDocument()
    const error = screen.getByText(/con la fecha visible/)
    expect(error).toHaveAttribute("id", "error-captura")
    expect(error).toHaveAttribute("role", "alert")
  })

  it("al corregir muestra la captura enviada y deja cambiarla", () => {
    render(
      <SelectorCaptura
        {...BASE}
        carga={carga()}
        actual={<p>Captura enviada</p>}
      />
    )
    expect(screen.getByText("Captura enviada")).toBeInTheDocument()
    expect(screen.getByText("Cambiar la captura")).toBeInTheDocument()
  })

  it("con una captura elegida y subida, la marca lista y deja cambiarla", async () => {
    const descartar = vi.fn()
    render(
      <SelectorCaptura
        {...BASE}
        carga={carga({
          elegida: new File(["x"], "panel.png", { type: "image/png" }),
          lista: {
            nombre: "panel.png",
            tipo: "image/webp",
            tamano: 1,
            sha256: null,
            dimensiones: null,
            duracionSeg: null,
            conMiniatura: false,
            bucket: "evidencias",
            ruta: "a",
            rutaMiniatura: null,
          },
          descartar,
        })}
      />
    )
    expect(screen.getByText("Lista para enviar")).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Cambiar" }))
    expect(descartar).toHaveBeenCalled()
  })

  it("al elegir la captura, el foco pasa a «Cambiar», que nombra el archivo (U3)", async () => {
    const usuario = userEvent.setup()
    const { container } = render(<ConCaptura />)
    await usuario.click(screen.getByRole("button", { name: "Elegir archivo" }))
    const entrada = container.querySelector<HTMLInputElement>(
      'input[type="file"]:not([capture])'
    )
    expect(entrada).not.toBeNull()
    await usuario.upload(entrada as HTMLInputElement, PANEL)
    const cambiar = await screen.findByRole("button", { name: "Cambiar" })
    await waitFor(() => expect(cambiar).toHaveFocus())
    expect(cambiar).toHaveAccessibleDescription("panel.png")
  })

  it("al cambiar la captura, el foco pasa a «Elegir archivo» (U3)", async () => {
    const usuario = userEvent.setup()
    render(<ConCaptura inicial={PANEL} />)
    await usuario.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toHaveFocus()
  })

  it("al quitar la captura que falló, el foco pasa a «Elegir archivo» (U3)", async () => {
    const usuario = userEvent.setup()
    render(<ConCaptura inicial={PANEL} conError />)
    await usuario.click(
      screen.getByRole("button", { name: "Quitar panel.png" })
    )
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toHaveFocus()
  })

  it("no le quita el foco a otro campo si la captura llega cuando ya pasó a él", async () => {
    // La captura elegida se aplica cuando la prueba lo decide.
    function Diferida() {
      const [revisada, setRevisada] = useState<File | null>(null)
      const [elegida, setElegida] = useState<File | null>(null)
      return (
        <>
          <label>
            Otro campo
            <input />
          </label>
          <button type="button" onClick={() => setElegida(revisada)}>
            Aplicar
          </button>
          <SelectorCaptura
            {...BASE}
            carga={carga({ elegida, elegir: setRevisada })}
          />
        </>
      )
    }
    const usuario = userEvent.setup()
    const { container } = render(<Diferida />)
    const entrada = container.querySelector<HTMLInputElement>(
      'input[type="file"]:not([capture])'
    )
    await usuario.upload(entrada as HTMLInputElement, PANEL)
    const otro = screen.getByLabelText("Otro campo")
    otro.focus()
    // `fireEvent` no mueve el foco: sigue en el otro campo.
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Cambiar" })
      ).toBeInTheDocument()
    )
    expect(otro).toHaveFocus()
  })

  it("con un error, el contenedor se marca para recibir el foco", () => {
    const { container } = render(
      <SelectorCaptura {...BASE} carga={carga()} error="Falta la captura." />
    )
    expect(container.firstElementChild).toHaveAttribute("data-foco-error")
    expect(container.firstElementChild).toHaveAttribute("tabindex", "-1")
  })
})
