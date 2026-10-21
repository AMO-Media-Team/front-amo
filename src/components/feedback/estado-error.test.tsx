import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { EstadoError } from "./estado-error"

describe("EstadoError", () => {
  it("reintenta y muestra el código de referencia", async () => {
    const onReintentar = vi.fn()
    render(<EstadoError onReintentar={onReintentar} digest="abc123" />)

    expect(screen.getByRole("alert")).toHaveTextContent("Algo salió mal")
    expect(screen.getByText("abc123")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }))
    expect(onReintentar).toHaveBeenCalledOnce()
  })

  it("omite el botón si no hay cómo reintentar", () => {
    render(<EstadoError titulo="Sin datos del mapa" />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByRole("heading")).toHaveTextContent("Sin datos del mapa")
  })

  it("usa el nivel de título pedido (h1 en errores de página)", () => {
    render(
      <EstadoError titulo="No pudimos mostrar esta página" nivelTitulo="h1" />
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "No pudimos mostrar esta página"
    )
  })
})
