import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { leerDetalleAlerta } from "../alertas"
import type { AlertaDelMedio } from "../tipos"
import { AlertasMedio } from "./alertas-medio"

function alerta(cambios: Partial<AlertaDelMedio> = {}): AlertaDelMedio {
  return {
    metricaId: "0192f3a4-0000-7000-8000-0000000000m1",
    asignacionId: "0192f3a4-0000-7000-8000-0000000000a1",
    estado: "PENDIENTE",
    desviacion: true,
    multiplo: true,
    detalle: leerDetalleAlerta({
      factor: 3,
      alcance: 126931,
      multiplo: 2,
      seguidores: 44792,
      impresiones: 154546,
      n_historial: 8,
      limite_alcance: 89584,
      mediana_historica: 1718.5,
      mediana_impresiones: 2430,
    }),
    creadaAt: "2026-10-05T15:00:00Z",
    corte: "H72",
    plataforma: "INSTAGRAM",
    fechaCorte: "2026-10-05T14:00:00Z",
    numeroPublicacion: 1,
    observaciones: null,
    validadaAt: null,
    oferta: "Lanzamiento de temporada",
    anunciante: "Café del Sur",
    handle: "radiopasto",
    ...cambios,
  }
}

describe("AlertasMedio", () => {
  it("sin alertas muestra un estado vacío", () => {
    render(<AlertasMedio alertas={[]} total={0} />)
    expect(screen.getByText("Sin alertas")).toBeInTheDocument()
  })

  it("explica cada regla con la cifra reportada al lado de lo esperado", () => {
    render(<AlertasMedio alertas={[alerta()]} total={1} />)
    expect(
      screen.getByText(
        "1 métrica con alerta: 1 por validar, 0 aprobadas, 0 rechazadas. Solo las ve el equipo AMO."
      )
    ).toBeInTheDocument()
    const tarjeta = screen.getByRole("article", {
      name: /Corte de 72 horas · publicación 1/,
    })
    expect(tarjeta).toHaveTextContent("@radiopasto")
    expect(tarjeta).toHaveTextContent("Por validar")

    const limite = within(tarjeta).getByRole("table", {
      name: "Cifras de «Alcance por encima de sus seguidores»",
    })
    const fila = within(limite).getByRole("row", { name: /^Alcance/ })
    expect(fila).toHaveTextContent("126.931")
    expect(fila).toHaveTextContent("(fuera de lo esperado)")
    expect(fila).toHaveTextContent("Hasta 89.584")
    expect(fila).toHaveTextContent("2 × 44.792 seguidores")

    const historico = within(tarjeta).getByRole("table", {
      name: "Cifras de «Fuera del histórico de la cuenta»",
    })
    expect(within(historico).getAllByRole("row")).toHaveLength(3)
    expect(historico).toHaveTextContent("Mediana de la cuenta: 2.430")

    expect(tarjeta).toHaveTextContent(
      "Por validar: Espera la validación del equipo AMO"
    )
    expect(
      within(tarjeta).getByRole("link", { name: /^Ver la asignación/ })
    ).toHaveAttribute(
      "href",
      "/operacion/asignaciones/0192f3a4-0000-7000-8000-0000000000a1"
    )
  })

  it("muestra lo que anotó quien la aprobó y la alerta previa a una corrección", () => {
    const corregida = alerta({
      estado: "APROBADA",
      desviacion: false,
      observaciones: "Validado contra las estadísticas nativas.",
      detalle: {
        ...alerta().detalle,
        previa: {
          desviacion: false,
          multiploSuperado: true,
          alcance: 200000,
          impresiones: 210000,
        },
      },
    })
    render(<AlertasMedio alertas={[corregida]} total={1} />)
    const tarjeta = screen.getByRole("article")
    expect(tarjeta).toHaveTextContent(
      "Lo que se revisó: Validado contra las estadísticas nativas."
    )
    expect(tarjeta).toHaveTextContent(
      "Antes de que el medio corrigiera las cifras ya tenía alerta (por encima de sus seguidores): alcance 200.000, impresiones 210.000."
    )
    expect(
      within(tarjeta).queryByRole("table", {
        name: /Fuera del histórico/,
      })
    ).not.toBeInTheDocument()
  })

  it("si hay más de las que se detallan, lo dice", () => {
    render(<AlertasMedio alertas={[alerta()]} total={130} />)
    expect(
      screen.getByText(
        "Se muestran 1 de 130 métricas con alerta, primero las que esperan validación. Solo las ve el equipo AMO."
      )
    ).toBeInTheDocument()
  })
})
