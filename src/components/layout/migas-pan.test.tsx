import { render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { describe, expect, it, vi } from "vitest"

import type { Miga } from "@/lib/auth/navegacion"

vi.mock("next/navigation", () => ({
  usePathname: () => "/campanas/c1/ofertas/o1",
}))

import { clasesMiga, MigasPan } from "./migas-pan"

const MIGAS: readonly Miga[] = [
  { titulo: "Mi negocio" },
  { titulo: "Mis campañas", href: "/campanas" },
  // Rutas dinámicas de ejemplo (las de verdad las arma `migas()`).
  { titulo: "Detalle", href: "/campanas/c1" as Route },
  { titulo: "Ofertas", href: "/campanas/c1?pestana=ofertas" as Route },
  { titulo: "Video de TikTok · Halloween" },
]

describe("clasesMiga", () => {
  it("solo la página actual se recorta; las demás no se encogen", () => {
    expect(clasesMiga(4, 5).item).toContain("truncate")
    for (const indice of [0, 1, 2, 3]) {
      const { item } = clasesMiga(indice, 5)
      expect(item).toContain("shrink-0")
      expect(item).toContain("whitespace-nowrap")
      expect(item).not.toContain("truncate")
    }
  })

  it("con poco ancho se ocultan primero las lejanas y al final el padre", () => {
    // El padre (penúltima) se oculta por debajo de 20 rem; el resto, de 36 rem.
    expect(clasesMiga(3, 5).item).toContain("@max-xs/migas:sr-only")
    expect(clasesMiga(3, 5).separador).toBe("@max-xs/migas:hidden")
    for (const indice of [0, 1, 2]) {
      expect(clasesMiga(indice, 5).item).toContain("@max-xl/migas:sr-only")
      expect(clasesMiga(indice, 5).separador).toBe("@max-xl/migas:hidden")
    }
    // Ocultas a la vista, reaparecen al recibir el foco (WCAG 2.4.7).
    expect(clasesMiga(0, 5).item).toContain(
      "@max-xl/migas:focus-within:not-sr-only"
    )
    expect(clasesMiga(3, 5).item).toContain(
      "@max-xs/migas:focus-within:not-sr-only"
    )
  })

  it("con dos migas, la primera es el padre", () => {
    expect(clasesMiga(0, 2).item).toContain("@max-xs/migas:sr-only")
    expect(clasesMiga(1, 2).item).toContain("truncate")
  })
})

describe("MigasPan", () => {
  it("todas las migas siguen para los lectores de pantalla y la última es la página", () => {
    render(<MigasPan migas={MIGAS} />)
    const migas = screen.getByRole("navigation", { name: "Ruta de navegación" })
    expect(migas).toHaveClass("@container/migas")
    expect(within(migas).getAllByRole("listitem")).toHaveLength(5)
    expect(
      within(migas).getByRole("link", { name: "Video de TikTok · Halloween" })
    ).toHaveAttribute("aria-current", "page")
  })

  it("cada enlace mide al menos 24 px de alto (WCAG 2.5.8)", () => {
    render(<MigasPan migas={MIGAS} />)
    const migas = screen.getByRole("navigation", { name: "Ruta de navegación" })
    for (const nombre of ["Mis campañas", "Detalle", "Ofertas"]) {
      expect(within(migas).getByRole("link", { name: nombre })).toHaveClass(
        "inline-flex",
        "min-h-6",
        "items-center"
      )
    }
  })
})
