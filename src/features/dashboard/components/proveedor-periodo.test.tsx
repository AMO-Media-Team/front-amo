import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { describe, expect, it, vi } from "vitest"

import { LimiteErrorBloque } from "./limite-error-bloque"
import {
  ContenidoPanel,
  ProveedorPeriodo,
  useActualizandoPanel,
  usePeriodoPanel,
} from "./proveedor-periodo"

function CambiarPeriodo() {
  const { fijar } = usePeriodoPanel()
  return (
    <button
      type="button"
      onClick={() => fijar({ periodo: "esteAno", desde: null, hasta: null })}
    >
      Este año
    </button>
  )
}

function dibujar(contenido: React.ReactNode) {
  return render(
    <NuqsTestingAdapter searchParams="">
      <ProveedorPeriodo porDefecto="ultimos30">
        <CambiarPeriodo />
        <ContenidoPanel>{contenido}</ContenidoPanel>
      </ProveedorPeriodo>
    </NuqsTestingAdapter>
  )
}

describe("ContenidoPanel", () => {
  it("no anuncia nada al llegar y avisa cuando el panel del periodo nuevo ya está", async () => {
    dibujar(<p>Bloques</p>)
    const estado = screen.getByRole("status")
    expect(estado).toBeEmptyDOMElement()

    await userEvent.click(screen.getByRole("button", { name: "Este año" }))
    await waitFor(() => expect(estado).toHaveTextContent("Panel actualizado."))
    expect(screen.getByText("Bloques")).toBeInTheDocument()
  })

  it("es el contenedor que miden las rejillas del panel", () => {
    dibujar(<p>Bloques</p>)
    expect(screen.getByText("Bloques").parentElement).toHaveClass(
      "@container/panel"
    )
  })
})

describe("useActualizandoPanel", () => {
  it("fuera del proveedor no falla: nada se está actualizando", () => {
    function Sonda() {
      return <p>{useActualizandoPanel() ? "actualizando" : "en reposo"}</p>
    }
    render(<Sonda />)
    expect(screen.getByText("en reposo")).toBeInTheDocument()
  })
})

describe("LimiteErrorBloque", () => {
  /** Falla mientras `roto` sea cierto: como una consulta que solo falla en un periodo. */
  const consulta = { rota: true }
  function Bloque() {
    if (consulta.rota) throw new Error("La consulta del bloque falló")
    return <p>Embudo con datos</p>
  }

  it("aísla el fallo y vuelve a pintar el bloque al llegar el periodo nuevo", async () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    consulta.rota = true
    dibujar(
      <>
        <p>Otro bloque</p>
        <LimiteErrorBloque titulo="Embudo de asignaciones">
          <Bloque />
        </LimiteErrorBloque>
      </>
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar «Embudo de asignaciones»"
    )
    // El resto del panel sigue en pie.
    expect(screen.getByText("Otro bloque")).toBeInTheDocument()

    // Con el periodo nuevo la consulta ya responde: no hace falta «Reintentar».
    consulta.rota = false
    await userEvent.click(screen.getByRole("button", { name: "Este año" }))
    await waitFor(() =>
      expect(screen.getByText("Embudo con datos")).toBeInTheDocument()
    )
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    silencio.mockRestore()
  })

  it("si el periodo nuevo también falla, el aviso sigue (sin bucles)", async () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    consulta.rota = true
    dibujar(
      <LimiteErrorBloque titulo="Embudo de asignaciones">
        <Bloque />
      </LimiteErrorBloque>
    )
    await userEvent.click(screen.getByRole("button", { name: "Este año" }))
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Panel actualizado.")
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar «Embudo de asignaciones»"
    )
    silencio.mockRestore()
  })
})
