import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ASIGNACION_ID, asignacionDePrueba } from "../fixtures"
import type { AsignacionMedio } from "../tipos"
import { AvisoAsignacionMedio } from "./aviso-asignacion-medio"

const DISPUTA = "0199f3a0-0000-7000-8000-0000000000d1"

function pintar(
  cambios: Partial<AsignacionMedio>,
  contexto = { correoSoporte: null as string | null, medioSuspendido: false }
) {
  return render(
    <AvisoAsignacionMedio
      asignacion={asignacionDePrueba(cambios)}
      contexto={contexto}
    />
  )
}

describe("AvisoAsignacionMedio", () => {
  it("cancelada por fraude: no se paga, con la causa y el motivo", () => {
    pintar({
      estado: "CANCELADA",
      causaCancelacion: "FRAUDE",
      motivo: "Las cifras no corresponden a la cuenta.",
    })
    const aviso = screen.getByRole("alert")
    expect(aviso).toHaveTextContent(
      "El equipo AMO canceló tu participación en esta campaña"
    )
    expect(aviso).toHaveTextContent(
      "Según los términos que aceptaste, esta publicación no se paga."
    )
    expect(aviso).toHaveTextContent(
      "Causa: fraude. «Las cifras no corresponden a la cuenta.»"
    )
    // Sin correo de soporte no se le pide escribir a ninguna parte (D74).
    expect(aviso).not.toHaveTextContent(/escr[ií]be/i)
  })

  it("con correo de soporte lo ofrece; con una disputa, la enlaza", () => {
    pintar(
      {
        estado: "CANCELADA",
        causaCancelacion: "ADMINISTRATIVA",
        disputa: {
          id: DISPUTA,
          estado: "RESUELTA",
          parte: "ANUNCIANTE",
          estadoOrigen: "PUBLICADA",
          estadoResultante: "CANCELADA",
          creadaAt: "2026-10-20T15:00:00.000Z",
          resueltaAt: "2026-10-21T15:00:00.000Z",
        },
      },
      { correoSoporte: "soporte@amo.co", medioSuspendido: false }
    )
    expect(
      screen.getByText("Si tienes dudas, escríbenos a soporte@amo.co.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/mis-campanas/${ASIGNACION_ID}/disputa`)
  })

  it("en disputa: quién la abrió, que siga con sus cortes y el enlace", () => {
    pintar({
      estado: "EN_DISPUTA",
      estadoPrevioDisputa: "EVIDENCIA_VALIDADA",
      disputa: {
        id: DISPUTA,
        estado: "ABIERTA",
        parte: "ANUNCIANTE",
        estadoOrigen: "EVIDENCIA_VALIDADA",
        estadoResultante: null,
        creadaAt: "2026-10-20T15:00:00.000Z",
        resueltaAt: null,
      },
    })
    const aviso = screen.getByRole("alert")
    expect(aviso).toHaveTextContent("Hay una disputa abierta")
    expect(aviso).toHaveTextContent("La abrió el anunciante.")
    expect(aviso).toHaveTextContent(/sigue cargándolos/)
    expect(
      screen.getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/mis-campanas/${ASIGNACION_ID}/disputa`)
  })

  it("en disputa sobre una verificada: solo se detiene la liquidación, sin cortes que cargar (C4)", () => {
    pintar({
      estado: "EN_DISPUTA",
      estadoPrevioDisputa: "VERIFICADA",
      disputa: {
        id: DISPUTA,
        estado: "ABIERTA",
        parte: "ANUNCIANTE",
        estadoOrigen: "VERIFICADA",
        estadoResultante: null,
        creadaAt: "2026-10-20T15:00:00.000Z",
        resueltaAt: null,
      },
    })
    const aviso = screen.getByRole("alert")
    expect(aviso).toHaveTextContent(
      "La abrió el anunciante. Mientras dure la disputa, esta publicación no se liquida."
    )
    expect(aviso).not.toHaveTextContent(/no se verifica/)
    expect(aviso).not.toHaveTextContent(/cortes de métricas/)
  })

  it("el reclamo de una vencida: el cupo no vuelve mientras se revisa", () => {
    pintar({
      estado: "EN_DISPUTA",
      estadoPrevioDisputa: "VENCIDA_SIN_PUBLICAR",
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Estamos revisando tu reclamoMientras lo revisamos, el cupo no vuelve a tu cuenta."
    )
    expect(screen.getByRole("link", { name: "Ver tu reclamo" })).toBeVisible()
  })

  it("suspendido: el aviso va en las campañas en curso, no en las cerradas (D73)", () => {
    const suspendido = { correoSoporte: null, medioSuspendido: true }
    const { unmount } = pintar({ estado: "PUBLICADA" }, suspendido)
    expect(screen.getByText("Tu medio está suspendido")).toBeVisible()
    expect(
      screen.getByText(
        "El equipo AMO revisa tus campañas en curso; mientras no te avisemos que se cancelan, puedes seguir cumpliéndolas."
      )
    ).toBeVisible()
    unmount()
    pintar({ estado: "PAGADA" }, suspendido)
    expect(
      screen.queryByText("Tu medio está suspendido")
    ).not.toBeInTheDocument()
  })

  it("una vencida y unas métricas atrasadas lo dicen", () => {
    const { unmount } = pintar({ estado: "VENCIDA_SIN_PUBLICAR" })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Venció el plazo para publicar"
    )
    unmount()
    pintar({
      estado: "EVIDENCIA_VALIDADA",
      metricasAtrasadasAt: "2026-10-22T15:00:00.000Z",
    })
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tienes métricas atrasadas"
    )
  })
})
