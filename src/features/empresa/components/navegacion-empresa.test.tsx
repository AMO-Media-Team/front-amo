import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const ruta = vi.hoisted(() => ({ actual: "/empresa" }))
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }))
const sesion = vi.hoisted(() => ({
  permisos: ["anunciantes.editar_propio"] as string[],
}))
vi.mock("@/components/layout/contexto-shell", () => ({
  useShell: () => ({ usuario: { permisos: sesion.permisos } }),
}))

import { NavegacionEmpresa } from "./navegacion-empresa"

beforeEach(() => {
  sesion.permisos = ["anunciantes.editar_propio"]
})

describe("NavegacionEmpresa", () => {
  it("marca «Datos» solo en la raíz", () => {
    ruta.actual = "/empresa"
    render(<NavegacionEmpresa />)
    const nav = screen.getByRole("navigation", {
      name: "Secciones de mi empresa",
    })
    expect(nav).toBeVisible()
    expect(screen.getByRole("link", { name: "Datos" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(
      screen.getByRole("link", { name: "Documentos" })
    ).not.toHaveAttribute("aria-current")
  })

  it("en una subpágina marca su pestaña y no la raíz", () => {
    ruta.actual = "/empresa/equipo"
    render(<NavegacionEmpresa />)
    expect(screen.getByRole("link", { name: "Equipo" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByRole("link", { name: "Datos" })).not.toHaveAttribute(
      "aria-current"
    )
    expect(screen.getByRole("link", { name: "Documentos" })).toHaveAttribute(
      "href",
      "/empresa/documentos"
    )
  })

  it("sin permiso para editar la empresa no ofrece Datos ni Documentos", () => {
    // ANU-002: un rol que solo gestiona campañas ve su equipo; las otras
    // pestañas lo llevarían a un 403.
    ruta.actual = "/empresa/equipo"
    sesion.permisos = ["campanas.gestionar_propias"]
    const { container } = render(<NavegacionEmpresa />)
    expect(container).toBeEmptyDOMElement()
  })
})
