import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction,
} from "nuqs/adapters/testing"
import { describe, expect, it, vi } from "vitest"

import { AvisoSinActividad } from "./aviso-sin-actividad"
import { ID_SELECTOR_PERIODO, ProveedorPeriodo } from "./proveedor-periodo"

function dibujar(busqueda: string, alActualizar?: OnUrlUpdateFunction) {
  return render(
    <NuqsTestingAdapter searchParams={busqueda} onUrlUpdate={alActualizar}>
      <ProveedorPeriodo porDefecto="ultimos30">
        <AvisoSinActividad detalle="negocios ni ofertas" />
      </ProveedorPeriodo>
    </NuqsTestingAdapter>
  )
}

describe("AvisoSinActividad", () => {
  it("explica el periodo vacío y ofrece ampliarlo a este año", async () => {
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    dibujar("", alActualizar)
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sin actividad en este periodo"
    )
    expect(
      screen.getByText(/No hubo negocios ni ofertas en estas fechas/)
    ).toHaveTextContent("Prueba con un periodo más amplio.")

    await userEvent.click(screen.getByRole("button", { name: "Ver este año" }))
    await waitFor(() => expect(alActualizar).toHaveBeenCalled())
    expect(alActualizar.mock.lastCall?.[0].queryString).toBe("?periodo=esteAno")
  })

  it("al ampliar, el foco pasa al selector de periodo (el botón desaparece)", async () => {
    render(
      <NuqsTestingAdapter searchParams="" hasMemory>
        <ProveedorPeriodo porDefecto="ultimos30">
          <button type="button" id={ID_SELECTOR_PERIODO}>
            Periodo
          </button>
          <AvisoSinActividad detalle="negocios ni ofertas" />
        </ProveedorPeriodo>
      </NuqsTestingAdapter>
    )
    await userEvent.click(screen.getByRole("button", { name: "Ver este año" }))
    expect(screen.getByRole("button", { name: "Periodo" })).toHaveFocus()
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Ver este año" })
      ).not.toBeInTheDocument()
    )
  })

  it("si ya se mira el año completo no ofrece ampliar", () => {
    dibujar("?periodo=esteAno")
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Prueba con un periodo más amplio/)
    ).not.toBeInTheDocument()
  })
})
