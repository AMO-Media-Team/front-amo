import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OfertaDeCampana } from "../tipos"
import { AvisoEmpresa } from "./aviso-empresa"
import { OfertasCampana } from "./ofertas-campana"

const AHORA = new Date("2026-10-22T15:00:00Z")
const CAMPANA = {
  id: "0199f3a0-0000-7000-8000-00000000ca01",
  estado: "ACTIVA" as const,
}

function oferta(
  id: string,
  cambios: Partial<OfertaDeCampana> = {}
): OfertaDeCampana {
  return {
    id,
    campanaId: CAMPANA.id,
    titulo: `Oferta ${id}`,
    estado: "PUBLICADA",
    plataforma: "INSTAGRAM",
    formato: "Reel",
    fechaLimiteAceptacion: "2026-10-25T15:00:00Z",
    ventanaInicio: "2026-10-26T05:00:00Z",
    ventanaFin: "2026-11-10T05:00:00Z",
    presupuestoMaximo: 3_000_000,
    presupuestoComprometido: 0,
    cuposTotales: 10,
    cuposOcupados: 4,
    comentarioModeracion: null,
    devueltaAt: null,
    actualizadaAt: "2026-10-20T15:00:00Z",
    ...cambios,
  }
}

describe("OfertasCampana", () => {
  it("destaca las devueltas con el comentario y el camino para reenviarlas", () => {
    render(
      <OfertasCampana
        campana={CAMPANA}
        ahora={AHORA}
        puedeCrear
        ofertas={[
          oferta("a"),
          oferta("b", {
            estado: "DEVUELTA",
            comentarioModeracion: "Falta la etiqueta de publicidad.",
            devueltaAt: "2026-10-21T15:00:00Z",
          }),
        ]}
      />
    )
    const devueltas = screen.getByRole("region", { name: "Ofertas devueltas" })
    expect(
      within(devueltas).getByText("Falta la etiqueta de publicidad.")
    ).toBeInTheDocument()
    expect(
      within(devueltas).getByRole("link", { name: "Ajustar y reenviar" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA.id}/ofertas/b/editar`)
    expect(
      within(devueltas).getByRole("link", { name: "Ver la oferta" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA.id}/ofertas/b`)

    const demas = screen.getByRole("region", { name: "Las demás ofertas" })
    const enlace = within(demas).getByRole("link", { name: "Oferta a" })
    expect(enlace).toHaveAttribute("href", `/campanas/${CAMPANA.id}/ofertas/a`)
    const fila = enlace.closest("li") as HTMLElement
    expect(fila).toHaveTextContent("Publicada")
    expect(fila).toHaveTextContent(/Presupuesto\s\$\s3\.000\.000/)
    expect(fila).toHaveTextContent("4 de 10 cupos tomados")
    expect(fila).toHaveTextContent(/· dentro de 3 días/)
    expect(screen.getByRole("link", { name: "Nueva oferta" })).toHaveAttribute(
      "href",
      `/campanas/${CAMPANA.id}/ofertas/nueva`
    )
  })

  it("una fecha límite vencida se dice; las cerradas no cuentan plazo", () => {
    render(
      <OfertasCampana
        campana={CAMPANA}
        ahora={AHORA}
        puedeCrear={false}
        ofertas={[
          oferta("v", {
            estado: "EN_REVISION",
            fechaLimiteAceptacion: "2026-10-21T15:00:00Z",
          }),
          oferta("c", {
            estado: "CERRADA",
            fechaLimiteAceptacion: "2026-10-01T15:00:00Z",
          }),
        ]}
      />
    )
    const vencida = screen.getByRole("link", { name: "Oferta v" }).closest("li")
    expect(vencida).toHaveTextContent("ya pasó")
    const cerrada = screen.getByRole("link", { name: "Oferta c" }).closest("li")
    expect(cerrada).not.toHaveTextContent("ya pasó")
    expect(screen.queryByRole("link", { name: "Nueva oferta" })).toBeNull()
  })

  it("sin ofertas invita a crear la primera; en borrador explica cuándo se envían", () => {
    render(
      <OfertasCampana
        campana={{ ...CAMPANA, estado: "BORRADOR" }}
        ahora={AHORA}
        puedeCrear
        ofertas={[]}
      />
    )
    expect(
      screen.getByText("Esta campaña aún no tiene ofertas")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Crear la primera oferta" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA.id}/ofertas/nueva`)
    expect(
      screen.getByText(/las enviarás a revisión cuando actives la campaña/)
    ).toBeInTheDocument()
  })
})

describe("AvisoEmpresa", () => {
  it("no pinta nada con la empresa verificada", () => {
    const { container } = render(
      <AvisoEmpresa
        situacion={{ estado: "VERIFICADO", motivo: null, enviadaAt: null }}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("una empresa rechazada ve el motivo y cómo corregir", () => {
    render(
      <AvisoEmpresa
        situacion={{
          estado: "RECHAZADO",
          motivo: "La Cámara de Comercio tiene más de 30 días.",
          enviadaAt: "2026-10-20T15:00:00Z",
        }}
      />
    )
    const aviso = screen.getByRole("region", {
      name: "No pudimos verificar tu empresa",
    })
    expect(
      within(aviso).getByText("La Cámara de Comercio tiene más de 30 días.")
    ).toBeInTheDocument()
    expect(
      within(aviso).getByRole("link", { name: "Corregir y reenviar" })
    ).toHaveAttribute("href", "/empresa")
  })
})
