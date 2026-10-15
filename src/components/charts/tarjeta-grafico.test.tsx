import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import { GraficoEmbudo } from "./grafico-embudo"
import { GraficoTendencia } from "./grafico-tendencia"
import { TarjetaGrafico } from "./tarjeta-grafico"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

beforeAll(() => {
  // jsdom no implementa ResizeObserver (Chart.js lo usa en modo responsive).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function renderizar(ui: React.ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

const SERIE = [{ id: "gmv", nombre: "GMV", valores: [100, 250, 180] }]

describe("TarjetaGrafico", () => {
  it("muestra título, descripción y las acciones estándar", () => {
    renderizar(
      <TarjetaGrafico titulo="GMV mensual" descripcion="Últimos 3 meses">
        <GraficoTendencia
          titulo="GMV mensual"
          etiquetas={["jul", "ago", "sept"]}
          series={SERIE}
          formato="numero"
        />
      </TarjetaGrafico>
    )
    expect(
      screen.getByRole("heading", { name: "GMV mensual" })
    ).toBeInTheDocument()
    expect(screen.getByText("Últimos 3 meses")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ver datos" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Exportar PNG" })).toBeEnabled()
    expect(
      screen.getByRole("button", { name: "Pantalla completa" })
    ).toBeEnabled()
  })

  it("el lienzo tiene resumen accesible y tabla alternativa siempre presente", () => {
    renderizar(
      <TarjetaGrafico titulo="GMV mensual">
        <GraficoTendencia
          titulo="GMV mensual"
          etiquetas={["jul", "ago", "sept"]}
          series={SERIE}
          formato="numero"
        />
      </TarjetaGrafico>
    )
    const grupo = screen.getByRole("group", { name: /GMV: 180 en sept/ })
    expect(grupo).toHaveAttribute("tabIndex", "0")
    const tabla = screen.getByRole("table", {
      name: "GMV mensual",
      hidden: true,
    })
    expect(within(tabla).getAllByRole("row")).toHaveLength(4)
  })

  it("«Ver datos» alterna a la tabla visible y vuelve al gráfico", async () => {
    const usuario = userEvent.setup()
    renderizar(
      <TarjetaGrafico titulo="Embudo">
        <GraficoEmbudo
          titulo="Embudo"
          etapas={[
            { id: "v", nombre: "Vistas", cantidad: 100 },
            { id: "a", nombre: "Aceptadas", cantidad: 40 },
          ]}
        />
      </TarjetaGrafico>
    )
    await usuario.click(screen.getByRole("button", { name: "Ver datos" }))
    // El nombre cambia con la vista: no es además un botón de alternancia.
    const boton = screen.getByRole("button", { name: "Ver gráfico" })
    expect(boton).not.toHaveAttribute("aria-pressed")
    expect(
      screen.getAllByRole("table", { name: "Embudo" }).length
    ).toBeGreaterThan(0)
    expect(screen.getAllByText("40,0%").length).toBeGreaterThan(0)
    await usuario.click(boton)
    expect(
      screen.getByRole("button", { name: "Ver datos" })
    ).toBeInTheDocument()
  })

  it("estados de carga y vacío sin acciones", () => {
    const { rerender } = renderizar(
      <TarjetaGrafico titulo="GMV" cargando>
        <span />
      </TarjetaGrafico>
    )
    expect(screen.getByRole("status")).toHaveTextContent("Cargando gráfico…")
    expect(
      screen.queryByRole("button", { name: "Ver datos" })
    ).not.toBeInTheDocument()

    rerender(
      <TooltipProvider>
        <TarjetaGrafico
          titulo="GMV"
          vacio={{ titulo: "Sin movimientos en el periodo" }}
        >
          <span />
        </TarjetaGrafico>
      </TooltipProvider>
    )
    expect(
      screen.getByText("Sin movimientos en el periodo")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Exportar PNG" })
    ).not.toBeInTheDocument()
  })
})
