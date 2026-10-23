import { render, screen } from "@testing-library/react"
import type { Route } from "next"
import { describe, expect, it } from "vitest"

import { NavegacionCortes, NavegacionPublicaciones } from "./cabecera-ejecucion"

describe("navegación de la ejecución", () => {
  it("lista los cortes de la oferta y el personalizado, con su estado", () => {
    render(
      <NavegacionCortes
        cortes={["H24", "H72"]}
        actual="H72"
        estados={new Map([["H24", "APROBADA"]])}
        ruta={(corte) => `/c/${corte}` as Route}
      />
    )
    const enlaces = screen.getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual([
      "24 horas: aprobada",
      "72 horas: por cargar",
      "Personalizado: por cargar",
    ])
    expect(screen.getByRole("link", { name: /^72 horas/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(
      screen.getByRole("navigation", { name: "Cortes de métricas" })
    ).toBeInTheDocument()
  })

  it("solo muestra las publicaciones si la oferta pide varias", () => {
    const { rerender } = render(
      <NavegacionPublicaciones
        total={1}
        actual={1}
        estados={new Map()}
        ruta={(n) => `/p/${n}` as Route}
      />
    )
    expect(screen.queryByRole("navigation")).toBeNull()
    rerender(
      <NavegacionPublicaciones
        total={2}
        actual={2}
        estados={new Map([[1, "RECHAZADA"]])}
        ruta={(n) => `/p/${n}` as Route}
      />
    )
    expect(
      screen.getByRole("link", { name: "Publicación 1: por corregir" })
    ).toHaveAttribute("href", "/p/1")
    expect(
      screen.getByRole("link", { name: "Publicación 2: por cargar" })
    ).toHaveAttribute("aria-current", "page")
  })
})
