import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { FilaKpi } from "@/components/kpi/tipos"

import { indicePorKpi } from "../kpi"
import { tarjetasAnunciante } from "../tarjetas"
import { EsqueletoTarjetasKpi, TarjetasKpi } from "./tarjetas-kpi"

const fila = (
  kpi: string,
  valor: number | null,
  unidad: string,
  parcial: Partial<FilaKpi> = {}
): FilaKpi => ({
  kpi,
  valor,
  valor_anterior: null,
  variacion: null,
  n: 12,
  unidad,
  serie: null,
  ...parcial,
})

const FILAS: FilaKpi[] = [
  fila("inversion_verificada", 39_000_000, "COP", {
    valor_anterior: 33_600_000,
    variacion: 0.1607,
  }),
  fila("inversion_comprometida", 52_800_000, "COP"),
  fila("campanas_activas", 4, "conteo"),
  fila("ofertas_publicadas", 12, "conteo"),
  fila("tasa_llenado", 0.83, "%"),
]

function dibujar(
  filas: readonly FilaKpi[] = FILAS,
  razones?: "agregadas" | "propias"
) {
  return render(
    <TarjetasKpi
      etiqueta="Indicadores de tu pauta"
      filas={filas}
      tarjetas={tarjetasAnunciante(indicePorKpi(filas))}
      nMinimo={20}
      razones={razones}
      etiquetaComparacion="vs. 30 días previos"
    />
  )
}

const tarjetaDe = (titulo: string) =>
  screen.getByRole("heading", { level: 3, name: titulo }).closest("article")

describe("TarjetasKpi", () => {
  it("titula el grupo con un h2 (las tarjetas son h3) y pinta las ocho", () => {
    dibujar()
    const grupo = screen.getByRole("region", {
      name: "Indicadores de tu pauta",
    })
    expect(
      within(grupo).getByRole("heading", {
        level: 2,
        name: "Indicadores de tu pauta",
      })
    ).toHaveClass("sr-only")
    expect(within(grupo).getAllByRole("article")).toHaveLength(8)
    expect(within(grupo).getAllByRole("heading", { level: 3 })).toHaveLength(8)
  })

  it("cada tarjeta lleva su comparativo y su dato de contexto", () => {
    dibujar()
    const inversion = screen
      .getByRole("heading", { level: 3, name: "Inversión" })
      .closest("div.rounded-xl")
    expect(inversion).not.toBeNull()
    const tarjeta = within(inversion as HTMLElement)
    expect(tarjeta.getByText("vs. 30 días previos")).toBeInTheDocument()
    expect(tarjeta.getByText("Comprometida")).toBeInTheDocument()
    expect(tarjeta.getByText(/52,8\sM/)).toBeInTheDocument()
  })

  it("la etiqueta abreviada del dato secundario se lee completa", () => {
    dibujar()
    // "Ofertas · cupos" es lo que cabe; el lector de pantalla oye el nombre completo.
    expect(screen.getByText("Ofertas publicadas · cupos tomados")).toHaveClass(
      "sr-only"
    )
    expect(screen.getByText("Ofertas · cupos")).toHaveAttribute(
      "aria-hidden",
      "true"
    )
  })

  it("un KPI que la RPC no devolvió queda sin dato, no en cero", () => {
    dibujar([])
    const alcance = screen
      .getByRole("heading", { level: 3, name: "Alcance" })
      .closest("article")
    expect(alcance).toHaveTextContent("Sin datos en el periodo")
  })
})

describe("razones sin valor (docs/kpis.md §0.4)", () => {
  const SIN_NEGOCIOS = [fila("engagement", null, "%", { n: 0 })]

  it("agregadas: la RPC ocultó la tasa por muestra y la tarjeta dice cuánta falta", () => {
    dibujar(SIN_NEGOCIOS)
    expect(tarjetaDe("Tasa de engagement")).toHaveTextContent(
      "Muestra insuficienten = 0 · se necesitan 20"
    )
  })

  it("propias: la tasa llega siempre, así que sin valor es que no hubo datos", () => {
    dibujar(SIN_NEGOCIOS, "propias")
    const tarjeta = tarjetaDe("Tasa de engagement")
    expect(tarjeta).toHaveTextContent("Sin datos en el periodo")
    expect(tarjeta).not.toHaveTextContent("se necesitan")
  })

  it("propias: con pocos negocios muestra la cifra y avisa de la muestra pequeña", () => {
    dibujar(
      [
        fila("engagement", 0.066, "%", {
          n: 7,
          valor_anterior: 0.06,
          variacion: 0.1,
        }),
      ],
      "propias"
    )
    const tarjeta = tarjetaDe("Tasa de engagement")
    expect(tarjeta).toHaveTextContent("6,6%")
    expect(tarjeta).toHaveTextContent("n = 7 · muestra pequeña")
  })
})

describe("EsqueletoTarjetasKpi", () => {
  it("un marcador por tarjeta, con la misma rejilla", () => {
    render(<EsqueletoTarjetasKpi cantidad={8} />)
    const grupo = screen.getByRole("region", { name: "Cargando indicadores" })
    expect(within(grupo).getAllByRole("status")).toHaveLength(8)
    expect(grupo).toHaveClass("@4xl/panel:grid-cols-4")
  })
})
