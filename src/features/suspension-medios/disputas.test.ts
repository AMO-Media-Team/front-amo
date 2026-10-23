import { describe, expect, it } from "vitest"

import {
  estaAbierta,
  ordenarDisputas,
  resumirDisputas,
  textoAperturaDisputa,
  textoEfectoDisputa,
} from "./disputas"

const DISPUTAS = [
  { id: "a", estado: "RESUELTA" as const, creadaAt: "2026-09-01T15:00:00Z" },
  { id: "b", estado: "ABIERTA" as const, creadaAt: "2026-10-10T15:00:00Z" },
  { id: "c", estado: "DESCARTADA" as const, creadaAt: "2026-10-01T15:00:00Z" },
  {
    id: "d",
    estado: "EN_REVISION" as const,
    creadaAt: "2026-10-05T15:00:00Z",
  },
]

describe("ordenarDisputas", () => {
  it("abiertas primero (la que más espera arriba) y luego las cerradas más recientes", () => {
    expect(ordenarDisputas(DISPUTAS).map((disputa) => disputa.id)).toEqual([
      "d",
      "b",
      "c",
      "a",
    ])
  })
})

describe("resumirDisputas", () => {
  it("cuenta abiertas (también en revisión), resueltas y descartadas", () => {
    expect(resumirDisputas(DISPUTAS)).toEqual({
      total: 4,
      abiertas: 2,
      resueltas: 1,
      descartadas: 1,
    })
    expect(estaAbierta("EN_REVISION")).toBe(true)
    expect(estaAbierta("RESUELTA")).toBe(false)
  })
})

describe("textos", () => {
  it("dice quién la abrió y cuándo se cerró, en fecha de Bogotá", () => {
    expect(
      textoAperturaDisputa({
        parte: "ANUNCIANTE",
        creadaAt: "2026-10-04T03:00:00Z",
        resueltaAt: null,
      })
    ).toMatch(/^Abierta por el anunciante el 3 de oct\.? de 2026$/)
    expect(
      textoAperturaDisputa({
        parte: "ADMIN",
        creadaAt: "2026-10-03T15:00:00Z",
        resueltaAt: "2026-10-09T15:00:00Z",
      })
    ).toMatch(/^Abierta por AMO el 3 .* · cerrada el 9 de oct\.? de 2026$/)
  })

  it("explica el efecto sobre la asignación según cómo terminó", () => {
    expect(
      textoEfectoDisputa({
        estado: "ABIERTA",
        estadoOrigen: "PUBLICADA",
        estadoResultante: null,
      })
    ).toBe(
      "La asignación estaba en «Publicada» al abrirla; no se verifica ni se liquida hasta resolverla."
    )
    expect(
      textoEfectoDisputa({
        estado: "RESUELTA",
        estadoOrigen: "METRICAS_CARGADAS",
        estadoResultante: "CANCELADA",
      })
    ).toBe("La asignación quedó en «Cancelada».")
    expect(
      textoEfectoDisputa({
        estado: "DESCARTADA",
        estadoOrigen: "VERIFICADA",
        estadoResultante: null,
      })
    ).toBe("Se descartó: la asignación volvió a «Verificada».")
  })
})
