import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { leerAlerta } from "@/features/operacion/alertas"

import type { AlertaDelMedio } from "../tipos"
import { AlertasMedio } from "./alertas-medio"

/** Como lo guarda `private.fn_metricas_alertas` (datos de la base local). */
const DETALLE = {
  factor: 3,
  alcance: 126931,
  multiplo: 2,
  seguidores: 44792,
  impresiones: 154546,
  n_historial: 8,
  limite_alcance: 89584,
  mediana_historica: 1718.5,
  mediana_impresiones: 2430,
}

function alerta(cambios: Partial<AlertaDelMedio> = {}): AlertaDelMedio {
  return {
    metricaId: "0192f3a4-0000-7000-8000-0000000000m1",
    asignacionId: "0192f3a4-0000-7000-8000-0000000000a1",
    estado: "PENDIENTE",
    alerta: leerAlerta({
      alerta_desviacion: true,
      alerta_multiplo: true,
      detalle_alertas: DETALLE,
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

    // La misma explicación que la cola y la ficha de la asignación.
    const porque = within(tarjeta).getByRole("region", {
      name: "Por qué tiene alerta",
    })
    expect(within(porque).getByRole("heading", { level: 4 })).toHaveTextContent(
      "Por qué tiene alerta"
    )
    expect(porque).toHaveTextContent("Alcance excesivo frente a los seguidores")
    expect(within(porque).getByText("Límite").nextSibling).toHaveTextContent(
      "89.584"
    )
    // El alcance reportado aparece en las dos razones que lo señalan.
    for (const dato of within(porque).getAllByText("Alcance reportado")) {
      expect(dato.nextSibling).toHaveTextContent("126.931")
    }
    // Alcance e impresiones se salen del histórico: una razón por cifra.
    expect(porque).toHaveTextContent("Alcance fuera del histórico de la cuenta")
    expect(porque).toHaveTextContent(
      "Impresiones fuera del histórico de la cuenta"
    )
    expect(porque).toHaveTextContent(
      "Mediana calculada con 8 métricas aprobadas de la misma cuenta en este corte."
    )

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
      observaciones: "Validado contra las estadísticas nativas.",
      alerta: leerAlerta({
        alerta_desviacion: false,
        alerta_multiplo: false,
        detalle_alertas: {
          ...DETALLE,
          alcance: 80000,
          alerta_previa: {
            ...DETALLE,
            alcance: 200000,
            desviacion: false,
            multiplo_superado: true,
          },
        },
      }),
    })
    render(<AlertasMedio alertas={[corregida]} total={1} />)
    const tarjeta = screen.getByRole("article")
    expect(tarjeta).toHaveTextContent(
      "Lo que se revisó: Validado contra las estadísticas nativas."
    )
    const porque = within(tarjeta).getByRole("region", {
      name: "Tuvo alerta antes de corregirse",
    })
    expect(porque).toHaveTextContent("Alcance excesivo frente a los seguidores")
    expect(porque).toHaveTextContent("200.000")
    expect(porque).not.toHaveTextContent("fuera del histórico")
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
