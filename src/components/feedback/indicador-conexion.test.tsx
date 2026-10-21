import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IndicadorConexion } from "./indicador-conexion"

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

function cambiarConexion(enLinea: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(enLinea)
  act(() => {
    window.dispatchEvent(new Event(enLinea ? "online" : "offline"))
  })
}

describe("IndicadorConexion", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("no avisa nada mientras hay conexión", () => {
    render(<IndicadorConexion />)
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("avisa al perder la conexión y confirma al recuperarla", () => {
    render(<IndicadorConexion />)

    cambiarConexion(false)
    expect(toast.warning).toHaveBeenCalledWith(
      "Sin conexión a internet",
      expect.objectContaining({ id: "estado-conexion" })
    )

    cambiarConexion(true)
    expect(toast.success).toHaveBeenCalledWith(
      "Conexión restablecida",
      expect.objectContaining({ id: "estado-conexion" })
    )
  })
})
