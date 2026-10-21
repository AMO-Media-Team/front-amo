import { describe, expect, it } from "vitest"

import { AHORA, entradaVacia } from "../fixtures"
import type { MetricasAtipicas } from "../tipos"
import { reglaMetricasAtipicas } from "./metricas-atipicas"

const HORA = 3_600_000
const haceHoras = (horas: number) => new Date(AHORA.getTime() - horas * HORA)

const ATIPICAS: MetricasAtipicas = {
  total: 5,
  desviacion: 3,
  multiplo: 2,
  masAntiguaAt: haceHoras(72),
}

describe("reglaMetricasAtipicas", () => {
  it("crítico si la más antigua espera más de 48 horas", () => {
    const insight = reglaMetricasAtipicas(
      entradaVacia({ metricasAtipicas: ATIPICAS })
    )
    expect(insight).toMatchObject({
      id: "metricas-atipicas",
      regla: 5,
      severidad: "critico",
      titulo: "5 reportes de métricas atípicos esperan validación",
      valor: 5,
      magnitud: 0.5,
    })
    expect(insight?.detalle).toBe(
      "3 se desvían del histórico del medio y 2 superan el alcance esperado para sus seguidores. La más antigua llegó hace 3 días."
    )
    expect(insight?.accion?.href).toBe(
      "/operacion/asignaciones?alerta=metricas"
    )
  })

  it("justo en 48 horas todavía es atención", () => {
    const insight = reglaMetricasAtipicas(
      entradaVacia({
        metricasAtipicas: { ...ATIPICAS, masAntiguaAt: haceHoras(48) },
      })
    )
    expect(insight?.severidad).toBe("atencion")
    const recien = reglaMetricasAtipicas(
      entradaVacia({
        metricasAtipicas: { ...ATIPICAS, masAntiguaAt: haceHoras(48.1) },
      })
    )
    expect(recien?.severidad).toBe("critico")
  })

  it("acepta la fecha como texto ISO de la RPC", () => {
    const insight = reglaMetricasAtipicas(
      entradaVacia({
        metricasAtipicas: {
          ...ATIPICAS,
          masAntiguaAt: haceHoras(5).toISOString(),
        },
      })
    )
    expect(insight?.severidad).toBe("atencion")
    expect(insight?.detalle).toContain("La más antigua llegó hace 5 horas.")
  })

  it("concuerda en singular y omite motivos en cero", () => {
    const insight = reglaMetricasAtipicas(
      entradaVacia({
        metricasAtipicas: {
          total: 1,
          desviacion: 0,
          multiplo: 1,
          masAntiguaAt: null,
        },
      })
    )
    expect(insight?.titulo).toBe(
      "1 reporte de métricas atípico espera validación"
    )
    expect(insight?.detalle).toBe(
      "1 supera el alcance esperado para sus seguidores."
    )
    expect(insight?.severidad).toBe("atencion")
  })

  it("sin desglose de motivos lo dice genéricamente; con fecha inválida no la usa", () => {
    const insight = reglaMetricasAtipicas(
      entradaVacia({
        metricasAtipicas: {
          total: 2,
          desviacion: 0,
          multiplo: 0,
          masAntiguaAt: "no-es-fecha",
        },
      })
    )
    expect(insight?.detalle).toBe("Tienen alertas de integridad.")
    expect(insight?.severidad).toBe("atencion")
  })

  it("la relevancia se satura en 10 pendientes", () => {
    const muchas = reglaMetricasAtipicas(
      entradaVacia({ metricasAtipicas: { ...ATIPICAS, total: 40 } })
    )
    expect(muchas?.magnitud).toBe(1)
  })

  it("sin pendientes no dispara", () => {
    expect(reglaMetricasAtipicas(entradaVacia())).toBeNull()
    expect(
      reglaMetricasAtipicas(
        entradaVacia({ metricasAtipicas: { ...ATIPICAS, total: 0 } })
      )
    ).toBeNull()
  })
})
