import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const acciones = vi.hoisted(() => ({
  prepararExportacionMetricas: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { PestanasFicha } from "@/features/operacion/components/pestanas-ficha"
import { ID_TITULO_SEGUIMIENTO } from "@/features/seguimiento/rutas"

import { datosMetricas } from "../fixtures"
import type { DatosMetricasCampana } from "../tipos"
import { PanelMetricas } from "./panel-metricas"

function renderizar(
  datos: DatosMetricasCampana,
  { url = "", puedeExportar = true } = {}
) {
  const usuario = userEvent.setup()
  const alActualizar = vi.fn<(evento: UrlUpdateEvent) => void>()
  render(
    <NuqsTestingAdapter searchParams={url} onUrlUpdate={alActualizar} hasMemory>
      <PanelMetricas datos={datos} puedeExportar={puedeExportar} />
    </NuqsTestingAdapter>
  )
  return { usuario, alActualizar }
}

/**
 * El panel dentro de las pestañas de la ficha, como en la página: «Ver el
 * seguimiento» cambia de pestaña y desmonta el panel de «Métricas».
 */
function renderizarEnPestanas(
  datos: DatosMetricasCampana,
  seguimiento: ReactNode
) {
  const usuario = userEvent.setup()
  const alActualizar = vi.fn<(evento: UrlUpdateEvent) => void>()
  render(
    <NuqsTestingAdapter
      searchParams="?pestana=metricas&corte=medio"
      onUrlUpdate={alActualizar}
      hasMemory
    >
      <PestanasFicha
        pestanas={[
          { clave: "ofertas", titulo: "Ofertas", icono: null, contenido: null },
          {
            clave: "seguimiento",
            titulo: "Seguimiento",
            icono: null,
            contenido: seguimiento,
          },
          {
            clave: "metricas",
            titulo: "Métricas",
            icono: null,
            contenido: <PanelMetricas datos={datos} puedeExportar={false} />,
          },
        ]}
      />
    </NuqsTestingAdapter>
  )
  return { usuario, alActualizar }
}

const SIN_PARCIALES = {
  conCortes: 0,
  alcance: 0,
  impresiones: 0,
  interacciones: 0,
  enEjecucion: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PanelMetricas", () => {
  it("muestra el consolidado, las razones y la tabla del corte por plataforma", () => {
    renderizar(datosMetricas())
    expect(
      screen.getByRole("heading", { name: "Resultados de la campaña" })
    ).toBeInTheDocument()
    const consolidado = screen.getByRole("region", { name: "Consolidado" })
    expect(
      within(consolidado).getByRole("heading", { name: /Alcance acumulado/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: /CPM efectivo/ })
    ).toBeInTheDocument()

    const tabla = screen.getByRole("table", {
      name: /Resultados por plataforma/,
    })
    const filas = within(tabla).getAllByRole("row")
    // Encabezado, Instagram, TikTok y toda la campaña.
    expect(filas).toHaveLength(4)
    expect(within(filas[1]).getByRole("rowheader")).toHaveTextContent(
      "Instagram"
    )
    expect(within(filas[3]).getByRole("rowheader")).toHaveTextContent(
      "Toda la campaña"
    )
    // n pequeño (menos de 20): se anuncia como muestra pequeña.
    expect(within(filas[1]).getByText(/muestra pequeña/)).toBeInTheDocument()
  })

  it("al elegir «Municipio» muestra los indicadores por municipio con su n", async () => {
    const { usuario, alActualizar } = renderizar(datosMetricas())
    const selector = screen.getByRole("group", { name: "Ver por" })
    await usuario.click(
      within(selector).getByRole("button", { name: "Municipio" })
    )

    expect(alActualizar.mock.calls.at(-1)?.[0].queryString).toBe(
      "?corte=municipio"
    )
    const tabla = screen.getByRole("table", {
      name: /Resultados por municipio/,
    })
    expect(
      within(tabla)
        .getAllByRole("rowheader")
        .map((celda) => celda.textContent)
    ).toEqual([
      "Bogotá, D.C.",
      "Arauca, Arauca",
      "Chía, Cundinamarca",
      "Toda la campaña",
    ])
    expect(
      within(tabla).getByRole("columnheader", { name: "Negocios (n)" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Municipios con más alcance" })
    ).toBeInTheDocument()
  })

  it("el corte de la URL se respeta al cargar", () => {
    renderizar(datosMetricas(), { url: "?corte=fecha" })
    expect(
      screen.getByRole("table", {
        name: /Resultados por fecha de verificación/,
      })
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole("group", { name: "Ver por" })).getByRole(
        "button",
        { name: "Fecha" }
      )
    ).toHaveAttribute("aria-pressed", "true")
  })

  it("avisa de los resultados parciales y enlaza al seguimiento", () => {
    renderizar(
      datosMetricas({
        parciales: {
          ...SIN_PARCIALES,
          conCortes: 2,
          alcance: 5000,
          enEjecucion: 1,
        },
      })
    )
    const aviso = screen.getByRole("complementary", {
      name: "Resultados parciales",
    })
    expect(aviso).toHaveTextContent(
      "el consolidado incluye solo 3 negocios verificados"
    )
    expect(
      within(aviso).getByRole("link", { name: "Ver el seguimiento" })
    ).toHaveAttribute(
      "href",
      "/campanas/0199f3a0-0000-7000-8000-00000000ca02?pestana=seguimiento"
    )
  })

  it("«Ver el seguimiento» cambia de pestaña y lleva el foco a su título", async () => {
    const { usuario, alActualizar } = renderizarEnPestanas(
      datosMetricas({ parciales: { ...SIN_PARCIALES, enEjecucion: 1 } }),
      <h2 id={ID_TITULO_SEGUIMIENTO} tabIndex={-1}>
        Seguimiento de los medios
      </h2>
    )
    await usuario.click(
      screen.getByRole("link", { name: "Ver el seguimiento" })
    )

    expect(screen.getByRole("tab", { name: "Seguimiento" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(
      screen.getByRole("heading", { name: "Seguimiento de los medios" })
    ).toHaveFocus()
    expect(
      screen.queryByRole("link", { name: "Ver el seguimiento" })
    ).toBeNull()
    // Lo mismo que su `href`, sin perder el resto de la URL.
    expect(alActualizar.mock.calls.at(-1)?.[0].queryString).toBe(
      "?pestana=seguimiento&corte=medio"
    )
  })

  it("si el seguimiento aún carga, el foco queda en su pestaña", async () => {
    const { usuario } = renderizarEnPestanas(
      datosMetricas({ parciales: { ...SIN_PARCIALES, enEjecucion: 1 } }),
      <p>Cargando el seguimiento…</p>
    )
    await usuario.click(
      screen.getByRole("link", { name: "Ver el seguimiento" })
    )
    const pestana = screen.getByRole("tab", { name: "Seguimiento" })
    expect(pestana).toHaveAttribute("aria-selected", "true")
    expect(pestana).toHaveFocus()
  })

  it("sin verificadas: estado vacío y exportar deshabilitado con su razón", () => {
    renderizar(
      datosMetricas({
        periodo: null,
        cortes: { plataforma: [], medio: [], municipio: [], fecha: [] },
        totales: {
          verificadas: 0,
          inversion: 0,
          alcance: 0,
          impresiones: 0,
          interacciones: 0,
          reproducciones: 0,
          clics: 0,
          cpm: null,
          costoInteraccion: null,
          engagement: null,
          costoAlcance: null,
        },
        parciales: { ...SIN_PARCIALES, enEjecucion: 4 },
      })
    )
    expect(
      screen.getByText("Aún no hay resultados verificados")
    ).toBeInTheDocument()
    const exportar = screen.getByRole("button", { name: "Exportar" })
    expect(exportar).toBeDisabled()
    expect(exportar).toHaveAccessibleDescription(
      "Podrás exportar cuando haya negocios verificados."
    )
    expect(screen.queryByRole("table")).toBeNull()
  })

  it("sin permiso de exportar no ofrece el botón", () => {
    renderizar(datosMetricas(), { puedeExportar: false })
    expect(screen.queryByRole("button", { name: "Exportar" })).toBeNull()
  })
})
