import { describe, expect, it } from "vitest"

import {
  CUBETAS_MAXIMAS_SERIE_FINA,
  cubetasSerie,
  DIAS_MAXIMOS_SERIE_SEMANAL,
  granularidadSerie,
} from "./serie"

describe("cubetas de la serie de una zona", () => {
  it("elige la granularidad por la duración del periodo", () => {
    expect(granularidadSerie(7)).toBe("dia")
    expect(granularidadSerie(14)).toBe("dia")
    expect(granularidadSerie(30)).toBe("semana")
    expect(granularidadSerie(98)).toBe("semana")
    expect(granularidadSerie(99)).toBe("mes")
  })

  it("una semana corta: un día por cubeta, ninguna parcial", () => {
    const serie = cubetasSerie("2026-09-24", "2026-09-30")
    expect(serie?.granularidad).toBe("dia")
    expect(serie?.cubetas).toHaveLength(7)
    expect(serie?.cubetas.every((c) => !c.parcial && c.desde === c.hasta)).toBe(
      true
    )
  })

  it("30 días: semanas ISO (lunes a domingo) recortadas al periodo", () => {
    // 2026-09-01 es martes; 2026-09-30, miércoles.
    const serie = cubetasSerie("2026-09-01", "2026-09-30")
    expect(serie?.granularidad).toBe("semana")
    expect(serie?.cubetas).toEqual([
      { desde: "2026-09-01", hasta: "2026-09-06", parcial: true },
      { desde: "2026-09-07", hasta: "2026-09-13", parcial: false },
      { desde: "2026-09-14", hasta: "2026-09-20", parcial: false },
      { desde: "2026-09-21", hasta: "2026-09-27", parcial: false },
      { desde: "2026-09-28", hasta: "2026-09-30", parcial: true },
    ])
  })

  it("periodos largos: meses calendario; el mes en curso queda parcial", () => {
    const serie = cubetasSerie("2025-07-01", "2026-10-01")
    expect(serie?.granularidad).toBe("mes")
    expect(serie?.cubetas).toHaveLength(16)
    expect(serie?.cubetas[0]).toEqual({
      desde: "2025-07-01",
      hasta: "2025-07-31",
      parcial: false,
    })
    expect(serie?.cubetas[7]).toEqual({
      desde: "2026-02-01",
      hasta: "2026-02-28",
      parcial: false,
    })
    expect(serie?.cubetas.at(-1)).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-01",
      parcial: true,
    })
  })

  it("las cubetas son contiguas y cubren el periodo completo", () => {
    const serie = cubetasSerie("2024-10-02", "2026-10-01")
    const cubetas = serie?.cubetas ?? []
    expect(cubetas[0].desde).toBe("2024-10-02")
    expect(cubetas[0].parcial).toBe(true)
    expect(cubetas.at(-1)?.hasta).toBe("2026-10-01")
    expect(cubetas.length).toBeLessThanOrEqual(25)
    for (let i = 1; i < cubetas.length; i++) {
      const anterior = new Date(`${cubetas[i - 1].hasta}T12:00:00Z`)
      const actual = new Date(`${cubetas[i].desde}T12:00:00Z`)
      expect(actual.getTime() - anterior.getTime()).toBe(86_400_000)
    }
  })

  it("la serie diaria o semanal nunca pasa del tope de lecturas a la BD", () => {
    const DIA_MS = 86_400_000
    const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const base = Date.UTC(2026, 0, 1)
    let maximo = 0
    // Cualquier día de la semana como inicio y cualquier duración "fina".
    for (let inicio = 0; inicio < 7; inicio++) {
      for (let dias = 1; dias <= DIAS_MAXIMOS_SERIE_SEMANAL; dias++) {
        const desde = base + inicio * DIA_MS
        const plan = cubetasSerie(dia(desde), dia(desde + (dias - 1) * DIA_MS))
        expect(plan?.granularidad).not.toBe("mes")
        maximo = Math.max(maximo, plan?.cubetas.length ?? 0)
      }
    }
    // 98 días que no empiezan en lunes tocan 15 semanas ISO.
    expect(maximo).toBe(CUBETAS_MAXIMAS_SERIE_FINA)
    expect(CUBETAS_MAXIMAS_SERIE_FINA).toBe(15)
  })

  it("fechas inválidas o invertidas: sin cubetas", () => {
    expect(cubetasSerie("2026-02-30", "2026-03-01")).toBeNull()
    expect(cubetasSerie("2026-03-02", "2026-03-01")).toBeNull()
  })
})
