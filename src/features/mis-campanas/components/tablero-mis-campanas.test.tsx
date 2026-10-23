import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction,
} from "nuqs/adapters/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { segmentoInicial } from "../estados"
import { asignacionDePrueba } from "../fixtures"
import { interpretarAccion } from "../siguiente-accion"
import {
  armarTablero,
  conteoDelTablero,
  type TableroMisCampanas,
} from "../tablero"
import { TableroMisCampanasMedio } from "./tablero-mis-campanas"

const AHORA = new Date("2026-10-26T12:00:00.000Z")
const A1 = "0199f3a0-0000-7000-8000-00000000a501"
const A2 = "0199f3a0-0000-7000-8000-00000000a502"
const A3 = "0199f3a0-0000-7000-8000-00000000a503"

function tableroDePrueba(): TableroMisCampanas {
  const metrica = interpretarAccion({
    asignacionId: A1,
    ofertaTitulo: "Video de TikTok",
    accion: "CARGAR_METRICA_H72",
    venceAt: "2026-10-27T17:30:00.000Z",
    numero: 1,
    corte: "H72",
  })
  return armarTablero(
    [
      asignacionDePrueba({
        id: A1,
        estado: "PUBLICADA",
        plataforma: "TIKTOK",
        ofertaTitulo: "Video de TikTok",
      }),
      asignacionDePrueba({
        id: A2,
        estado: "VENCIDA_SIN_PUBLICAR",
        ofertaTitulo: "Historia de Facebook",
        reclamoHasta: "2026-10-28T12:00:00.000Z",
      }),
      asignacionDePrueba({
        id: A3,
        estado: "PAGADA",
        ofertaTitulo: "Post de feed",
        pagadaAt: "2026-10-01T00:00:00.000Z",
      }),
    ],
    metrica ? [metrica] : [],
    AHORA
  )
}

function pintar(
  tablero: TableroMisCampanas,
  {
    busqueda,
    alActualizar,
  }: { busqueda?: string; alActualizar?: OnUrlUpdateFunction } = {}
) {
  return render(
    <NuqsTestingAdapter searchParams={busqueda} onUrlUpdate={alActualizar}>
      <TableroMisCampanasMedio
        tablero={tablero}
        segmentoInicial={segmentoInicial(conteoDelTablero(tablero))}
        ahoraServidor={AHORA.getTime()}
        puedeEjecutar
        puedeVerOfertas
        completas
      />
    </NuqsTestingAdapter>
  )
}

describe("TableroMisCampanasMedio", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("abre el primer segmento con algo y muestra el conteo de cada uno", () => {
    pintar(tableroDePrueba())
    expect(
      screen.getByText("Tienes 1 campaña con algo por hacer.")
    ).toBeVisible()
    const segmentos = screen.getByRole("tablist", {
      name: "Campañas por estado",
    })
    expect(
      within(segmentos).getByRole("tab", {
        name: "Pendiente de métricas: 1 campaña",
      })
    ).toHaveAttribute("aria-selected", "true")
    expect(
      within(segmentos).getByRole("tab", { name: "Por publicar: 0 campañas" })
    ).toBeInTheDocument()
    expect(
      within(segmentos).getByRole("tab", {
        name: "En verificación: 0 campañas",
      })
    ).toBeInTheDocument()

    // MED-011: evidencia cargada y el corte de 72 h pendiente, con su cuenta regresiva.
    const tarjeta = screen.getByRole("article", { name: "Video de TikTok" })
    expect(
      within(tarjeta).getByText("Carga las métricas de 72 horas")
    ).toBeVisible()
    expect(within(tarjeta).getByText(/^Vence en 1 día 5 h/)).toBeInTheDocument()
    expect(
      within(tarjeta).getByRole("link", { name: "Video de TikTok" })
    ).toHaveAttribute("href", `/mis-campanas/${A1}`)
  })

  it("cambiar de segmento queda en la URL y muestra sus tarjetas", async () => {
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    pintar(tableroDePrueba(), { alActualizar })

    await usuario.click(
      screen.getByRole("tab", { name: /^Vencidas o canceladas/ })
    )
    expect(alActualizar).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryString: "?segmento=caidas" })
    )
    // MED-011: la vencida ofrece reclamar dentro del plazo.
    const vencida = screen.getByRole("article", {
      name: "Historia de Facebook",
    })
    expect(
      within(vencida).getByText("Puedes reclamar si publicaste a tiempo")
    ).toBeVisible()
    expect(within(vencida).getByText("Vencida")).toBeVisible()
  })

  it("sin vencidas ni canceladas no da por cumplido lo que sigue pendiente", () => {
    // A1 aún debe las métricas de 72 h: el vacío no felicita.
    pintar(
      { ...tableroDePrueba(), caidas: [] },
      { busqueda: "?segmento=caidas" }
    )
    const panel = screen.getByRole("tabpanel")
    expect(within(panel).getByText("Nada vencido ni cancelado")).toBeVisible()
    expect(within(panel).queryByText(/cumplido/)).not.toBeInTheDocument()
  })

  it("un segmento vacío lo explica y lleva a las ofertas", () => {
    pintar(tableroDePrueba(), { busqueda: "?segmento=por_publicar" })
    expect(screen.getByText("Nada por publicar")).toBeVisible()
    expect(
      within(screen.getByRole("tabpanel")).getByRole("link", {
        name: "Ver ofertas",
      })
    ).toHaveAttribute("href", "/ofertas")
  })

  it("sin campañas, invita a ver las ofertas", () => {
    pintar(armarTablero([], [], AHORA))
    expect(screen.getByText("Aún no tienes campañas")).toBeVisible()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver ofertas" })).toBeVisible()
  })
})
