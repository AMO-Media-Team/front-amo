import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import { describe, expect, it, vi } from "vitest"

import type { FacetasMarketplace } from "../tipos"
import { FiltrosMarketplace } from "./filtros-marketplace"

const ALIMENTOS = "01a16693-72fe-713c-a45a-70d759c08301"
const SALUD = "01a16693-72fe-713c-a45a-70d759c08302"
const COSECHA = "01a16693-72fe-713c-a45a-70d759c08201"

const FACETAS: FacetasMarketplace = {
  sectores: [
    { id: ALIMENTOS, nombre: "Alimentos y bebidas" },
    { id: SALUD, nombre: "Salud y farmacia" },
  ],
  anunciantes: [{ id: COSECHA, nombre: "La Cosecha SAS" }],
}

function renderizar(
  searchParams = "",
  facetas: FacetasMarketplace | null = FACETAS
) {
  const usuario = userEvent.setup()
  const alActualizar = vi.fn<(evento: UrlUpdateEvent) => void>()
  render(
    <NuqsTestingAdapter
      searchParams={searchParams}
      onUrlUpdate={alActualizar}
      hasMemory
    >
      <FiltrosMarketplace facetas={facetas}>
        <p>Lista de ofertas</p>
      </FiltrosMarketplace>
    </NuqsTestingAdapter>
  )
  return { usuario, alActualizar }
}

function ultimaUrl(alActualizar: ReturnType<typeof vi.fn>): string {
  const evento = alActualizar.mock.calls.at(-1)?.[0] as
    UrlUpdateEvent | undefined
  return evento?.queryString ?? ""
}

describe("FiltrosMarketplace", () => {
  it("la plataforma va a la URL y vuelve a la primera página", async () => {
    const { usuario, alActualizar } = renderizar("?pagina=3")

    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await usuario.click(screen.getByRole("button", { name: /TikTok/ }))

    expect(ultimaUrl(alActualizar)).toBe("?plataforma=tiktok")
  })

  it("«Todas» quita la plataforma; tocar la activa no la desmarca", async () => {
    const { usuario, alActualizar } = renderizar("?plataforma=facebook")

    expect(screen.getByRole("button", { name: /Facebook/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await usuario.click(screen.getByRole("button", { name: /Facebook/ }))
    expect(alActualizar).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole("button", { name: "Todas" }))
    expect(ultimaUrl(alActualizar)).toBe("")
  })

  it("ordenar por pago y ver las rechazadas", async () => {
    const { usuario, alActualizar } = renderizar()

    await usuario.click(screen.getByRole("button", { name: "Mejor pago" }))
    expect(ultimaUrl(alActualizar)).toBe("?orden=pago")

    await usuario.click(
      screen.getByRole("switch", { name: "Ver las que rechacé" })
    )
    expect(ultimaUrl(alActualizar)).toBe("?orden=pago&rechazadas=true")
  })

  it("sector y anunciante con las opciones de las facetas; vuelven a la primera página", async () => {
    const { usuario, alActualizar } = renderizar("?pagina=2")

    const sector = screen.getByRole("combobox", { name: "Sector" })
    // El campo dice «Todos» (cabe en media columna); la lista, el nombre completo.
    expect(sector).toHaveTextContent("Todos")
    expect(sector).not.toHaveTextContent("Todos los sectores")
    await usuario.click(sector)
    await usuario.click(
      await screen.findByRole("option", { name: "Salud y farmacia" })
    )
    expect(ultimaUrl(alActualizar)).toBe(`?sector=${SALUD}`)

    await usuario.click(screen.getByRole("combobox", { name: "Anunciante" }))
    await usuario.click(
      await screen.findByRole("option", { name: "La Cosecha SAS" })
    )
    expect(ultimaUrl(alActualizar)).toBe(
      `?sector=${SALUD}&anunciante=${COSECHA}`
    )

    await usuario.click(screen.getByRole("combobox", { name: "Sector" }))
    await usuario.click(
      await screen.findByRole("option", { name: "Todos los sectores" })
    )
    expect(ultimaUrl(alActualizar)).toBe(`?anunciante=${COSECHA}`)
  })

  it("los días de publicación: opción rápida y «Cualquier día»", async () => {
    const { usuario, alActualizar } = renderizar()

    await usuario.click(
      screen.getByRole("button", {
        name: "Días de publicación: Cualquier día",
      })
    )
    const panel = await screen.findByRole("dialog", {
      name: "Elegir los días de publicación",
    })
    await usuario.click(within(panel).getByRole("button", { name: "Hoy" }))
    expect(ultimaUrl(alActualizar)).toMatch(
      /^\?desde=(\d{4}-\d{2}-\d{2})&hasta=\1$/
    )
    // El panel se cierra con animación y el rótulo se actualiza con la URL:
    // se espera a ambos antes de reabrirlo (bajo carga tardan más).
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    )

    await usuario.click(
      await screen.findByRole("button", { name: "Días de publicación: Hoy" })
    )
    await usuario.click(
      within(
        await screen.findByRole("dialog", {
          name: "Elegir los días de publicación",
        })
      ).getByRole("button", { name: "Cualquier día" })
    )
    expect(ultimaUrl(alActualizar)).toBe("")
  })

  it("«Limpiar filtros» quita todo menos el orden y deja el foco en los filtros", async () => {
    const { usuario, alActualizar } = renderizar(
      `?plataforma=tiktok&sector=${ALIMENTOS}&anunciante=${COSECHA}&desde=2026-10-26&hasta=2026-11-01&rechazadas=true&orden=pago&pagina=3`
    )
    expect(screen.getByRole("combobox", { name: "Sector" })).toHaveTextContent(
      "Alimentos y bebidas"
    )

    await usuario.click(screen.getByRole("button", { name: "Limpiar filtros" }))

    // Limpiar corre en una transición: bajo carga, la URL y el foco llegan después.
    await waitFor(() => expect(ultimaUrl(alActualizar)).toBe("?orden=pago"))
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Limpiar filtros" })
      ).not.toBeInTheDocument()
    )
    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Filtros de las ofertas" })
      ).toHaveFocus()
    )
  })

  it("un valor de la URL sin nombre conocido no muestra su id", () => {
    const huerfano = "01a16693-72fe-713c-a45a-70d759c08399"
    renderizar(`?sector=${huerfano}`)
    const sector = screen.getByRole("combobox", { name: "Sector" })
    expect(sector).toHaveTextContent("Sin ofertas ahora")
    expect(sector).not.toHaveTextContent(huerfano)
    expect(
      screen.getByRole("button", { name: "Limpiar filtros" })
    ).toBeVisible()
  })

  it("sin filtros no ofrece «Limpiar filtros»; sin facetas, solo los días", () => {
    renderizar("?orden=pago", null)
    expect(
      screen.queryByRole("button", { name: "Limpiar filtros" })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^Días de publicación:/ })
    ).toBeVisible()
  })

  it("muestra la lista dentro del marco de carga", () => {
    renderizar()
    expect(screen.getByText("Lista de ofertas")).toBeVisible()
    expect(
      screen.getByRole("group", { name: "Filtros de las ofertas" })
    ).toBeVisible()
  })
})
