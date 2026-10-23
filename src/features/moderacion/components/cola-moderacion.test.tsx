import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// La cola lee la BD; aquí solo se prueban sus piezas de presentación.
vi.mock("../queries", () => ({ colaModeracion: vi.fn() }))

import { TAMANO_PAGINA_MODERACION } from "../cola"
import type { OfertaEnCola } from "../tipos"
import { PaginacionModeracion, TarjetaOfertaCola } from "./cola-moderacion"

const AHORA = new Date("2026-10-22T15:00:00.000Z")

const OFERTA: OfertaEnCola = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000f1",
  titulo: "Reel de Halloween",
  plataforma: "INSTAGRAM",
  formato: "Reel",
  anunciante: "Supermercados La Cosecha",
  campana: "Halloween 2026",
  presupuestoMaximo: 4_000_000,
  cuposTotales: 8,
  fechaLimiteAceptacion: "2026-11-05T22:00:00.000Z",
  enviadaAt: "2026-10-22T12:00:00.000Z",
  reenvio: false,
}

describe("TarjetaOfertaCola", () => {
  it("resume la oferta y lleva a su ficha", () => {
    render(<TarjetaOfertaCola oferta={OFERTA} ahora={AHORA} />)
    const tarjeta = screen.getByRole("article")
    expect(
      within(tarjeta).getByRole("link", { name: "Reel de Halloween" })
    ).toHaveAttribute("href", `/operacion/ofertas/${OFERTA.id}`)
    expect(
      within(tarjeta).getByRole("link", { name: "Revisar Reel de Halloween" })
    ).toHaveAttribute("href", `/operacion/ofertas/${OFERTA.id}`)
    expect(tarjeta).toHaveTextContent("Supermercados La Cosecha")
    expect(tarjeta).toHaveTextContent("Halloween 2026")
    expect(tarjeta).toHaveTextContent("Reel de Instagram")
    expect(tarjeta).toHaveTextContent("8 cupos")
    expect(tarjeta).toHaveTextContent("Enviada hace 3 horas")
    expect(tarjeta).not.toHaveTextContent("Reenvío")
    expect(tarjeta).not.toHaveTextContent(/Venc/)
  })

  it("destaca la fecha límite vencida y el reenvío", () => {
    render(
      <TarjetaOfertaCola
        oferta={{
          ...OFERTA,
          reenvio: true,
          fechaLimiteAceptacion: "2026-10-22T13:00:00.000Z",
        }}
        ahora={AHORA}
      />
    )
    const tarjeta = screen.getByRole("article")
    expect(tarjeta).toHaveTextContent("Reenvío")
    expect(tarjeta).toHaveTextContent("Venció hace 2 horas")
  })

  it("avisa cuando la fecha límite está cerca", () => {
    render(
      <TarjetaOfertaCola
        oferta={{
          ...OFERTA,
          fechaLimiteAceptacion: "2026-10-23T11:00:00.000Z",
        }}
        ahora={AHORA}
      />
    )
    expect(screen.getByRole("article")).toHaveTextContent(
      "Vence dentro de 20 horas"
    )
  })
})

describe("PaginacionModeracion", () => {
  it("no aparece con una sola página", () => {
    const { container } = render(
      <PaginacionModeracion pagina={1} total={TAMANO_PAGINA_MODERACION} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("muestra el rango y enlaza a las páginas vecinas", () => {
    render(
      <PaginacionModeracion
        pagina={2}
        total={TAMANO_PAGINA_MODERACION * 2 + 5}
      />
    )
    const navegacion = screen.getByRole("navigation", {
      name: "Páginas de la cola de moderación",
    })
    expect(navegacion).toHaveTextContent("21–40 de 45")
    expect(
      within(navegacion).getByRole("link", { name: "Anteriores" })
    ).toHaveAttribute("href", "/operacion/moderacion")
    expect(
      within(navegacion).getByRole("link", { name: "Siguientes" })
    ).toHaveAttribute("href", "/operacion/moderacion?pagina=3")
  })

  it("en la última página, «Siguientes» queda deshabilitado", () => {
    render(<PaginacionModeracion pagina={3} total={45} />)
    expect(screen.getByRole("button", { name: "Siguientes" })).toBeDisabled()
  })
})
