import { describe, expect, it } from "vitest"

import { notaValidacion, ordenarAlertas, resumirAlertas } from "./alertas"

// El porqué de cada alerta lo prueba `@/features/operacion/alertas.test.ts`.

describe("notaValidacion", () => {
  it("la nota de la validación dice qué se revisó, por qué se rechazó o que espera", () => {
    expect(
      notaValidacion({ estado: "APROBADA", observaciones: " Cuadra. " })
    ).toEqual({ etiqueta: "Lo que se revisó", texto: "Cuadra." })
    expect(
      notaValidacion({ estado: "RECHAZADA", observaciones: null })
    ).toEqual({
      etiqueta: "Motivo del rechazo",
      texto: "Se rechazó sin anotaciones.",
    })
    expect(
      notaValidacion({ estado: "PENDIENTE", observaciones: null }).etiqueta
    ).toBe("Por validar")
  })
})

describe("orden y resumen", () => {
  const alertas = [
    { metricaId: "a", estado: "APROBADA" as const, creadaAt: "2026-10-03" },
    { metricaId: "b", estado: "PENDIENTE" as const, creadaAt: "2026-09-01" },
    { metricaId: "c", estado: "RECHAZADA" as const, creadaAt: "2026-10-05" },
    { metricaId: "d", estado: "PENDIENTE" as const, creadaAt: "2026-10-01" },
  ]

  it("pone primero las que esperan validación y luego las más recientes", () => {
    expect(ordenarAlertas(alertas).map((alerta) => alerta.metricaId)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ])
  })

  it("cuenta por estado de validación", () => {
    expect(resumirAlertas(alertas)).toEqual({
      total: 4,
      porValidar: 2,
      aprobadas: 1,
      rechazadas: 1,
    })
  })
})
