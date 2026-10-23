import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ofertasPorAtender } from "@/features/campanas/reglas"
import type { CampanaActiva, OfertaPorAtender } from "@/features/campanas/tipos"

import {
  CampanasActivasPanel,
  OfertasPorAtenderPanel,
} from "./operacion-anunciante"

const AHORA = new Date("2026-10-22T15:00:00Z")
const CAMPANA = "0199f3a0-0000-7000-8000-00000000ca01"

function oferta(
  id: string,
  cambios: Partial<OfertaPorAtender>
): OfertaPorAtender {
  return {
    id,
    campanaId: CAMPANA,
    campana: "Temporada navideña",
    titulo: `Oferta ${id}`,
    estado: "BORRADOR",
    plataforma: "TIKTOK",
    formato: "Video",
    fechaLimiteAceptacion: "2026-11-20T15:00:00Z",
    ventanaInicio: "2026-11-21T05:00:00Z",
    ventanaFin: "2026-12-10T05:00:00Z",
    presupuestoMaximo: 2_000_000,
    presupuestoComprometido: 0,
    cuposTotales: 5,
    cuposOcupados: 0,
    comentarioModeracion: null,
    devueltaAt: null,
    actualizadaAt: "2026-10-20T15:00:00Z",
    ...cambios,
  }
}

describe("OfertasPorAtenderPanel", () => {
  it("lista las devueltas y los borradores con el plazo encima, enlazados a su ficha", () => {
    const atenciones = ofertasPorAtender(
      [
        oferta("dev", {
          estado: "DEVUELTA",
          comentarioModeracion: "El enlace de destino no es seguro.",
          devueltaAt: "2026-10-21T15:00:00Z",
        }),
        oferta("pronto", { fechaLimiteAceptacion: "2026-10-24T15:00:00Z" }),
        oferta("lejos", {}),
      ],
      { ahora: AHORA, anticipacionHoras: 24 }
    )
    render(
      <OfertasPorAtenderPanel
        atenciones={atenciones}
        total={atenciones.length + 2}
        ahora={AHORA}
      />
    )
    const panel = screen.getByRole("region", { name: "Requieren tu atención" })
    const lista = within(panel).getByRole("list", {
      name: "Ofertas por atender",
    })
    const items = within(lista).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("AMO te la devolvió para ajustarla")
    expect(items[0]).toHaveTextContent("«El enlace de destino no es seguro.»")
    expect(items[0]).toHaveTextContent("Temporada navideña · Video")
    expect(
      within(items[0]).getByRole("link", { name: "Oferta dev" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA}/ofertas/dev`)
    expect(items[1]).toHaveTextContent("Envíala a revisión pronto")
    expect(
      within(panel).getByText("Y 2 más en tus campañas.")
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole("link", { name: "Ir a mis campañas" })
    ).toHaveAttribute("href", "/campanas")
  })

  it("sin pendientes lo dice en positivo", () => {
    render(<OfertasPorAtenderPanel atenciones={[]} total={0} ahora={AHORA} />)
    expect(screen.getByText("Nada pendiente")).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })
})

describe("CampanasActivasPanel", () => {
  const ACTIVA: CampanaActiva = {
    id: CAMPANA,
    nombre: "Temporada navideña",
    marca: "Café Sierra Alta",
    fechaInicio: "2026-10-01",
    fechaFin: "2026-10-31",
    presupuestoTotal: 20_000_000,
    presupuestoComprometido: 5_000_000,
    ofertasPorEstado: { PUBLICADA: 2, DEVUELTA: 1 },
  }

  it("muestra cada campaña con su fase, sus ofertas y el presupuesto comprometido", () => {
    render(
      <CampanasActivasPanel
        campanas={[ACTIVA]}
        total={6}
        hoy="2026-10-22"
        puedeCrear
      />
    )
    const panel = screen.getByRole("region", { name: "Campañas activas" })
    // Una activa puede no tener ofertas todavía: la descripción no lo promete.
    expect(
      within(panel).getByText(
        "Las que están en curso, con sus ofertas por estado."
      )
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole("link", { name: "Temporada navideña" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA}`)
    expect(panel).toHaveTextContent(
      "Café Sierra Alta · En curso · faltan 9 días"
    )
    expect(panel).toHaveTextContent("1 devuelta")
    expect(panel).toHaveTextContent("2 publicadas")
    expect(panel).toHaveTextContent(/\$\s?5\sM\s?\/\s?\$\s?20\sM comprometido/)
    expect(
      within(panel).getByRole("link", { name: "Ver las 6 activas" })
    ).toHaveAttribute("href", "/campanas?estado=ACTIVA")
    expect(
      within(panel).getByRole("link", { name: "Crear campaña" })
    ).toHaveAttribute("href", "/campanas/nueva")
  })

  it("sin campañas activas invita a crear una (sin repetir el botón)", () => {
    render(
      <CampanasActivasPanel
        campanas={[]}
        total={0}
        hoy="2026-10-22"
        puedeCrear
      />
    )
    expect(screen.getByText("No tienes campañas activas")).toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /Crear campaña/ })).toHaveLength(
      1
    )
    expect(
      screen.getByRole("link", { name: "Ver todas mis campañas" })
    ).toHaveAttribute("href", "/campanas")
  })
})
