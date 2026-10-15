import { render, screen, within } from "@testing-library/react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import { desempeno, FACTURAS, MEDIOS, MUNICIPIOS } from "../../fixtures"
import {
  desempenoPorPlataforma,
  inversionPorDepartamento,
  rankingMedios,
  resumenCartera,
} from "../datos"
import { GraficoPlataformasAnunciante } from "./graficos-anunciante"
import {
  CarteraAnunciante,
  CoberturaAnunciante,
  MediosDestacados,
} from "./paneles-anunciante"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeAll(() => {
  // jsdom no implementa ResizeObserver (Chart.js lo usa en modo responsive).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null) => (texto ?? "").replace(/[  ]/g, " ")

describe("CarteraAnunciante", () => {
  it("suma el saldo, separa lo vencido y ordena primero lo que ya venció", () => {
    render(
      <CarteraAnunciante cartera={resumenCartera(FACTURAS, "2026-10-05")} />
    )
    expect(plano(screen.getByText(/23\.400\.000/).textContent)).toBe(
      "$ 23.400.000"
    )
    expect(screen.getByText(/vencido · 1 factura$/)).toBeInTheDocument()
    const filas = screen.getAllByRole("listitem")
    expect(filas).toHaveLength(3)
    // La vencida va primero, y sin número se llama solo "Factura".
    expect(filas[0]).toHaveTextContent(/^Factura\s*Venció el/)
    expect(filas[1]).toHaveTextContent("Factura FE1018")
    expect(filas[1]).toHaveTextContent("Vence el 5 de oct de 2026")
  })

  it("sin saldo pendiente lo dice en positivo", () => {
    render(<CarteraAnunciante cartera={resumenCartera([], "2026-10-05")} />)
    expect(screen.getByText("Estás al día")).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})

describe("MediosDestacados", () => {
  it("con muestra suficiente ordena por engagement y deja fuera al que no la tiene", () => {
    render(<MediosDestacados ranking={rankingMedios(MEDIOS, 5)} nMinimo={5} />)
    expect(
      screen.getByRole("heading", { name: "Medios con mejor engagement" })
    ).toBeInTheDocument()
    const tabla = screen.getByRole("table", { name: "Medios por engagement" })
    const medios = within(tabla)
      .getAllByRole("rowheader")
      .map((celda) => celda.textContent)
    expect(medios).toEqual([
      expect.stringContaining("Medellín Se Mueve"),
      expect.stringContaining("Bogotá Insólita"),
      expect.stringContaining("Cali Pachanguera"),
    ])
    // 12 % de engagement con un solo negocio: no compite en el ranking.
    expect(screen.queryByText(/Huila Noticias/)).not.toBeInTheDocument()
  })

  it("sin medios comparables ordena por alcance y explica por qué", () => {
    render(
      <MediosDestacados ranking={rankingMedios(MEDIOS, 20)} nMinimo={20} />
    )
    expect(
      screen.getByRole("heading", { name: "Medios con más alcance" })
    ).toBeInTheDocument()
    // El criterio exige varios medios comparables, no uno solo.
    expect(
      screen.getByText(/hacen falta 3 medios con al menos 20 negocios medidos/)
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Huila Noticias/).length).toBeGreaterThan(0)
  })

  it("sin métricas validadas muestra el estado vacío", () => {
    render(<MediosDestacados ranking={rankingMedios([], 5)} nMinimo={5} />)
    expect(
      screen.getByText("Sin medios con métricas en el periodo")
    ).toBeInTheDocument()
    // Sin medios no hay ranking que titular ni criterio que justificar.
    expect(
      screen.getByRole("heading", { name: "Medios destacados" })
    ).toBeInTheDocument()
    expect(screen.queryByText(/negocios medidos/)).not.toBeInTheDocument()
  })
})

describe("CoberturaAnunciante", () => {
  const departamentos = inversionPorDepartamento([
    desempeno("11", "Bogotá, D. C.", 15_200_000),
    desempeno("05", "Antioquia", 9_800_000),
  ])

  it("los cinco municipios con más inversión y el resumen de cobertura", () => {
    render(
      <CoberturaAnunciante
        departamentos={departamentos}
        municipios={MUNICIPIOS}
      />
    )
    const ranking = screen.getByRole("list", {
      name: "Municipios con más inversión",
    })
    const filas = within(ranking).getAllByRole("listitem")
    expect(filas).toHaveLength(5)
    expect(filas[0]).toHaveTextContent("Bogotá, D.C.")
    expect(screen.queryByText("Palmira, Valle")).not.toBeInTheDocument()
    expect(
      screen.getByText("Tu pauta llegó a 6 municipios de 2 departamentos.")
    ).toBeInTheDocument()
  })

  it("sin cobertura no dibuja el mapa", () => {
    render(<CoberturaAnunciante departamentos={{}} municipios={[]} />)
    expect(
      screen.getByText("Aún sin cobertura en el periodo")
    ).toBeInTheDocument()
    expect(screen.queryByRole("group")).not.toBeInTheDocument()
  })
})

describe("GraficoPlataformasAnunciante", () => {
  it("la eficiencia por red es una tabla accesible con el CPM en pesos exactos", () => {
    render(
      <TooltipProvider>
        <GraficoPlataformasAnunciante
          plataformas={desempenoPorPlataforma([
            desempeno("INSTAGRAM", "Instagram", 22_400_000, { cpm: 9_100.4 }),
            desempeno("TIKTOK", "TikTok", 13_600_000, { cpm: 6_400 }),
          ])}
        />
      </TooltipProvider>
    )
    const tabla = screen.getByRole("table", {
      name: "Eficiencia por plataforma en el periodo",
    })
    // Sin `<table>`: el pie de la tarjeta va dentro de un `<p>` en pantalla completa.
    expect(tabla.tagName).toBe("SPAN")
    const filas = within(tabla).getAllByRole("row")
    expect(filas).toHaveLength(3)
    expect(plano(filas[1].textContent)).toBe("Instagram$ 9.1006,6%")
    expect(
      within(filas[2]).getByRole("rowheader", { name: "TikTok" })
    ).toBeInTheDocument()
  })
})
