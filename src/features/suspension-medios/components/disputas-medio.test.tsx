import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { DisputaDelMedio } from "../tipos"
import { DisputasMedio } from "./disputas-medio"

function disputa(cambios: Partial<DisputaDelMedio> = {}): DisputaDelMedio {
  return {
    id: "0192f3a4-0000-7000-8000-0000000000d1",
    estado: "ABIERTA",
    motivo: "METRICAS",
    parte: "ANUNCIANTE",
    descripcion:
      "El alcance reportado no coincide con lo que vimos en la cuenta.",
    resolucion: null,
    estadoOrigen: "METRICAS_CARGADAS",
    estadoResultante: null,
    creadaAt: "2026-10-03T15:00:00Z",
    resueltaAt: null,
    asignacion: {
      id: "0192f3a4-0000-7000-8000-0000000000a1",
      estado: "EN_DISPUTA",
      oferta: "Lanzamiento de temporada",
      anunciante: "Café del Sur",
    },
    ...cambios,
  }
}

const RESUELTA = disputa({
  id: "0192f3a4-0000-7000-8000-0000000000d2",
  estado: "RESUELTA",
  motivo: "INCUMPLIMIENTO",
  parte: "MEDIO",
  resolucion: "Se comprobó que publicó a tiempo.",
  estadoOrigen: "VENCIDA_SIN_PUBLICAR",
  estadoResultante: "CONTENIDO_ENTREGADO",
  resueltaAt: "2026-09-12T15:00:00Z",
  asignacion: {
    id: "0192f3a4-0000-7000-8000-0000000000a2",
    estado: "VERIFICADA",
    oferta: "Reel del aniversario",
    anunciante: null,
  },
})

describe("DisputasMedio", () => {
  it("sin disputas muestra un estado vacío", () => {
    render(
      <DisputasMedio disputas={[]} verAsignaciones cerradasMostradas={null} />
    )
    expect(
      screen.getByText("Ninguna de sus asignaciones ha tenido una disputa.")
    ).toBeInTheDocument()
  })

  it("resume por estado y enlaza cada disputa y su asignación", () => {
    render(
      <DisputasMedio
        disputas={[disputa(), RESUELTA]}
        verAsignaciones
        cerradasMostradas={null}
      />
    )
    expect(
      screen.getByText(
        "2 disputas: 1 abierta o en revisión, 1 resuelta, 0 descartadas."
      )
    ).toBeInTheDocument()
    const lista = screen.getByRole("list", { name: "Disputas del medio" })
    const abierta = within(lista).getByRole("article", {
      name: "Métricas · Lanzamiento de temporada",
    })
    expect(abierta).toHaveTextContent("Abierta")
    expect(abierta).toHaveTextContent(/Abierta por el anunciante el 3 de oct/)
    expect(abierta).toHaveTextContent(
      "La asignación estaba en «Métricas cargadas» al abrirla"
    )
    expect(
      within(abierta).getByRole("link", {
        name: /^Ver la disputa ?sobre «Lanzamiento de temporada»$/,
      })
    ).toHaveAttribute(
      "href",
      "/operacion/disputas/0192f3a4-0000-7000-8000-0000000000d1"
    )
    expect(
      within(abierta).getByRole("link", {
        name: /^Ver la asignación ?de «Lanzamiento de temporada»$/,
      })
    ).toHaveAttribute(
      "href",
      "/operacion/asignaciones/0192f3a4-0000-7000-8000-0000000000a1"
    )

    const resuelta = within(lista).getByRole("article", {
      name: "Incumplimiento · Reel del aniversario",
    })
    expect(resuelta).toHaveTextContent(
      "La asignación quedó en «Contenido descargado»."
    )
    expect(resuelta).toHaveTextContent(
      "Resolución: Se comprobó que publicó a tiempo."
    )
    expect(resuelta).toHaveTextContent(/cerrada el 12 de sept/)
  })

  it("sin `asignaciones.ver` no enlaza la asignación", () => {
    render(
      <DisputasMedio
        disputas={[disputa()]}
        verAsignaciones={false}
        cerradasMostradas={null}
      />
    )
    expect(
      screen.queryByRole("link", { name: /Ver la asignación/ })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Ver la disputa/ })
    ).toBeInTheDocument()
  })

  it("si hay más cerradas que las que se muestran, lo dice", () => {
    render(
      <DisputasMedio
        disputas={[disputa(), RESUELTA]}
        verAsignaciones
        cerradasMostradas={100}
      />
    )
    expect(
      screen.getByText(
        "1 abierta o en revisión y las 100 cerradas más recientes."
      )
    ).toBeInTheDocument()
  })
})
