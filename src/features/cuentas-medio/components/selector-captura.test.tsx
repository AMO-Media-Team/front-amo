import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { SelectorCaptura } from "./selector-captura"
import type { CargaCaptura } from "./use-carga-captura"

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
    elemento: null,
    elegir: vi.fn(),
    enviar: vi.fn(),
    reintentar: vi.fn(),
    descartar: vi.fn(),
    ...cambios,
  }
}

const BASE = {
  titulo: "Captura de tus estadísticas",
  descripcionVista: "Captura de las estadísticas de @radiopasto",
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
                  id: "cuenta",
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

describe("SelectorCaptura (cuentas del medio)", () => {
  it("asocia el error a la zona mientras no hay captura elegida", () => {
    render(
      <SelectorCaptura {...BASE} carga={carga()} error="Elige la captura." />
    )
    const error = screen.getByText("Elige la captura.")
    expect(error).toHaveAttribute("id", "error-captura")
    expect(error).toHaveAttribute("role", "alert")
  })

  it("al elegir la captura, el foco pasa a «Cambiar», que nombra el archivo (U3)", async () => {
    const usuario = userEvent.setup()
    const { container } = render(<ConCaptura />)
    await usuario.click(screen.getByRole("button", { name: "Elegir archivo" }))
    const entrada =
      container.querySelector<HTMLInputElement>('input[type="file"]')
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
    const entrada =
      container.querySelector<HTMLInputElement>('input[type="file"]')
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
})
