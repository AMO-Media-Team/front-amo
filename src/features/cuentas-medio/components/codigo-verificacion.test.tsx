import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

import { CodigoVerificacion } from "./codigo-verificacion"

const AHORA = new Date("2026-10-22T15:00:00Z")

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  toast.success.mockReset()
  toast.error.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("CodigoVerificacion", () => {
  it("muestra el código en dos grupos, deletreado para el lector y con su vencimiento", () => {
    render(
      <CodigoVerificacion codigo="K7P4XQ" expiraAt="2026-10-22T15:45:00Z" />
    )
    const zona = screen.getByRole("region", {
      name: "Tu código de verificación",
    })
    expect(zona).toHaveTextContent("K7P 4XQ")
    expect(screen.getByText("K, 7, P, 4, X, Q")).toHaveClass("sr-only")
    expect(screen.getByText(/Vence en 45 min/)).toBeInTheDocument()
  })

  it("copia el código al portapapeles", async () => {
    const usuario = userEvent.setup()
    const escribir = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)
    render(
      <CodigoVerificacion codigo="K7P4XQ" expiraAt="2026-10-22T15:45:00Z" />
    )
    await usuario.click(screen.getByRole("button", { name: "Copiar código" }))
    expect(escribir).toHaveBeenCalledWith("K7P4XQ")
    expect(screen.getByRole("button", { name: "Copiado" })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("Código copiado")
  })

  it("si no puede copiar, pide escribirlo", async () => {
    const usuario = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denegado")
    )
    render(
      <CodigoVerificacion codigo="K7P4XQ" expiraAt="2026-10-22T15:45:00Z" />
    )
    await usuario.click(screen.getByRole("button", { name: "Copiar código" }))
    expect(toast.error).toHaveBeenCalledWith(
      "No pudimos copiarlo. Escríbelo tal como lo ves."
    )
  })
})
