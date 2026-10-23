import { render, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const acciones = vi.hoisted(() => ({
  aceptarOferta: vi.fn(),
  rechazarOferta: vi.fn(),
  registrarVistaOferta: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { RegistroVista } from "./registro-vista"

const OFERTA = "01a16693-730a-7983-9254-666751ffcd3b"
const OTRA = "01a16693-72ed-7cd3-acbc-9d657b861ac4"

beforeEach(() => {
  vi.clearAllMocks()
  acciones.registrarVistaOferta.mockResolvedValue({ ok: true })
})

describe("RegistroVista (MED-009 c2)", () => {
  it("registra la vista una sola vez por oferta, también en modo estricto", async () => {
    const vista = render(
      <StrictMode>
        <RegistroVista ofertaId={OFERTA} />
      </StrictMode>
    )
    vista.rerender(
      <StrictMode>
        <RegistroVista ofertaId={OFERTA} />
      </StrictMode>
    )
    await waitFor(() =>
      expect(acciones.registrarVistaOferta).toHaveBeenCalledTimes(1)
    )
    expect(acciones.registrarVistaOferta).toHaveBeenCalledWith({
      ofertaId: OFERTA,
    })

    vista.rerender(
      <StrictMode>
        <RegistroVista ofertaId={OTRA} />
      </StrictMode>
    )
    await waitFor(() =>
      expect(acciones.registrarVistaOferta).toHaveBeenLastCalledWith({
        ofertaId: OTRA,
      })
    )
    expect(acciones.registrarVistaOferta).toHaveBeenCalledTimes(2)
  })

  it("un fallo de red no se propaga ni pinta nada", async () => {
    acciones.registrarVistaOferta.mockRejectedValue(
      new Error("Failed to fetch")
    )
    const { container } = render(<RegistroVista ofertaId={OFERTA} />)
    await waitFor(() =>
      expect(acciones.registrarVistaOferta).toHaveBeenCalledOnce()
    )
    expect(container).toBeEmptyDOMElement()
  })
})
