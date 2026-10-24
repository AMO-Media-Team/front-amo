import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { leerAlerta, SIN_ALERTA } from "../alertas"
import { PorqueAlerta } from "./porque-alerta"

/** INT-004: Instagram con 40.000 seguidores reporta 95.000 de alcance. */
const MULTIPLO = {
  multiplo: 2,
  seguidores: 40000,
  alcance: 95000,
  impresiones: 120000,
  limite_alcance: 80000,
  n_historial: 6,
}

/** INT-003: mediana de 10.000 y un reporte de 45.000 (factor 3). */
const DESVIACION = {
  alcance: 45000,
  impresiones: 60000,
  mediana_historica: 10000,
  mediana_impresiones: 30000,
  factor: 3,
  n_historial: 8,
}

describe("PorqueAlerta", () => {
  it("sin razones que explicar no pinta nada", () => {
    const { container } = render(
      <PorqueAlerta alerta={SIN_ALERTA} plataforma="INSTAGRAM" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("explica cada razón con sus cifras lado a lado (ADM-008 c1)", () => {
    render(
      <PorqueAlerta
        alerta={leerAlerta({
          alerta_desviacion: false,
          alerta_multiplo: true,
          detalle_alertas: MULTIPLO,
        })}
        plataforma="INSTAGRAM"
      />
    )
    const porque = screen.getByRole("region", { name: "Por qué tiene alerta" })
    expect(within(porque).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Por qué tiene alerta"
    )
    expect(porque).toHaveTextContent("Alcance excesivo frente a los seguidores")
    expect(porque).toHaveTextContent(
      "El alcance (95.000) supera el límite de 80.000"
    )
    for (const [etiqueta, valor] of [
      ["Alcance reportado", "95.000"],
      ["Seguidores al aceptar", "40.000"],
      ["Múltiplo permitido", "2 ×"],
      ["Límite", "80.000"],
    ]) {
      expect(within(porque).getByText(etiqueta).nextSibling).toHaveTextContent(
        valor
      )
    }
    expect(porque).toHaveTextContent(
      "Mediana calculada con 6 métricas aprobadas de la misma cuenta en este corte."
    )
  })

  it("con alerta hoy y antes de corregirse, explica las dos", () => {
    render(
      <PorqueAlerta
        alerta={leerAlerta({
          alerta_desviacion: true,
          alerta_multiplo: false,
          detalle_alertas: {
            ...DESVIACION,
            alerta_previa: { ...MULTIPLO, multiplo_superado: true },
          },
        })}
        plataforma="FACEBOOK"
        nivelTitulo={4}
      />
    )
    const porque = screen.getByRole("region", { name: "Por qué tiene alerta" })
    expect(within(porque).getByRole("heading", { level: 4 })).toBeVisible()
    expect(porque).toHaveTextContent("Alcance fuera del histórico de la cuenta")
    expect(porque).toHaveTextContent("Antes de corregirse también tenía alerta")
    expect(porque).toHaveTextContent("Alcance excesivo frente a los seguidores")
  })

  it("una corregida dice que tuvo alerta; sin plataforma habla de alcance", () => {
    render(
      <PorqueAlerta
        alerta={leerAlerta({
          alerta_desviacion: false,
          alerta_multiplo: false,
          detalle_alertas: {
            alerta_previa: { ...MULTIPLO, multiplo_superado: true },
          },
        })}
        plataforma={null}
      />
    )
    const porque = screen.getByRole("region", {
      name: "Tuvo alerta antes de corregirse",
    })
    expect(porque).toHaveTextContent("Alcance reportado")
    expect(porque).not.toHaveTextContent("también tenía")
  })
})
