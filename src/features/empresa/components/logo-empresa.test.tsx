import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  prepararSubidaLogo: vi.fn(),
  confirmarLogo: vi.fn(),
  quitarLogo: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
// El transporte real (Supabase, TUS) no se usa: aquí no se sube nada.
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { LogoEmpresa } from "./logo-empresa"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("LogoEmpresa", () => {
  it("sin logo muestra las iniciales e invita a subirlo", () => {
    render(
      <LogoEmpresa nombre="Andina Express" logoUrl={null} tieneLogo={false} />
    )
    expect(screen.getByRole("region", { name: "Logo" })).toBeVisible()
    expect(screen.getByText("AE")).toBeVisible()
    expect(
      screen.getByText("Andina Express aún no tiene logo")
    ).toBeInTheDocument()
    expect(screen.getByText(/^Sube el logo/)).toBeVisible()
    expect(screen.queryByRole("button", { name: "Quitar logo" })).toBeNull()
  })

  it("con logo ofrece cambiarlo o quitarlo (con confirmación)", async () => {
    acciones.quitarLogo.mockResolvedValue(exito())
    render(
      <LogoEmpresa
        nombre="Andina"
        logoUrl="https://firmada.test/logo.webp"
        tieneLogo
      />
    )
    expect(screen.getByText(/^Cambia el logo/)).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Quitar logo" }))
    await screen.findByRole("alertdialog", { name: "¿Quitar el logo?" })
    const botones = screen.getAllByRole("button", { name: "Quitar logo" })
    await userEvent.click(botones[botones.length - 1])
    expect(acciones.quitarLogo).toHaveBeenCalledTimes(1)
    expect(avisos.success).toHaveBeenCalledWith("Logo quitado")
  })
})
