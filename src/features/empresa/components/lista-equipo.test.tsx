import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { MiembroEquipo } from "../tipos"
import { ListaEquipo } from "./lista-equipo"

const PROPIO = { clave: "ANUNCIANTE", nombre: "Anunciante", color: "#3FB8AF" }

const MIEMBROS: MiembroEquipo[] = [
  {
    id: "a",
    nombre: "Ana Compras",
    email: "ana@andina.co",
    rolClave: "ANUNCIANTE_COMPRAS",
    estado: "INVITADO",
    ultimoAccesoAt: null,
  },
  {
    id: "yo",
    nombre: "Laura Mercadeo",
    email: "laura@andina.co",
    rolClave: "ANUNCIANTE",
    estado: "ACTIVO",
    ultimoAccesoAt: "2026-10-21T15:00:00Z",
  },
]

describe("ListaEquipo", () => {
  it("lista a la persona de la sesión primero, con rol, estado y último acceso", () => {
    render(<ListaEquipo miembros={MIEMBROS} yoId="yo" rolPropio={PROPIO} />)
    const equipo = screen.getByRole("region", { name: "Tu equipo en AMO" })
    expect(
      within(equipo).getByText("2 personas · 1 invitación pendiente")
    ).toBeVisible()
    const filas = within(equipo).getAllByRole("listitem")
    expect(within(filas[0]).getByText("Laura Mercadeo")).toBeVisible()
    expect(within(filas[0]).getByText("Tú")).toBeVisible()
    expect(within(filas[0]).getByText("Anunciante")).toBeVisible()
    expect(within(filas[0]).getByText(/^Último acceso/)).toBeVisible()
    expect(within(filas[1]).getByText("Anunciante compras")).toBeVisible()
    expect(within(filas[1]).getByText("Invitado")).toBeVisible()
    expect(within(filas[1]).getByText("Aún no activa su cuenta")).toBeVisible()
  })

  it("explica que las cuentas nuevas las crea el equipo AMO", () => {
    render(<ListaEquipo miembros={MIEMBROS} yoId="yo" rolPropio={PROPIO} />)
    expect(screen.getByText("¿Necesitas sumar a alguien?")).toBeVisible()
    expect(
      screen.getByText(/Las cuentas nuevas las crea el equipo de AMO/)
    ).toBeVisible()
  })

  it("sin personas muestra un estado vacío amable", () => {
    render(<ListaEquipo miembros={[]} yoId="yo" rolPropio={PROPIO} />)
    expect(screen.getByText("Aún no vemos a tu equipo")).toBeVisible()
  })
})
