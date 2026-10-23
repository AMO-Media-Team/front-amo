import { describe, expect, it } from "vitest"

import { engagement, nombresColumnas, ordenarCortes } from "./metricas"

describe("nombresColumnas", () => {
  it("TikTok habla de espectadores y reproducciones", () => {
    expect(nombresColumnas("TIKTOK")).toEqual({
      alcance: "Espectadores únicos",
      impresiones: "Reproducciones",
    })
    expect(nombresColumnas("INSTAGRAM").alcance).toBe("Alcance")
  })
})

describe("engagement", () => {
  it("interacciones sobre alcance; sin alcance no hay tasa", () => {
    expect(engagement(50, 1_000)).toBe(0.05)
    expect(engagement(50, 0)).toBeNull()
    expect(engagement(null, 1_000)).toBeNull()
  })
})

describe("ordenarCortes", () => {
  it("24 h → 72 h → 7 días → personalizado, y por fecha dentro del mismo", () => {
    const ordenados = ordenarCortes([
      { corte: "D7" as const, fechaCorte: "2026-09-08" },
      { corte: "PERSONALIZADO" as const, fechaCorte: "2026-09-03" },
      { corte: "H24" as const, fechaCorte: "2026-09-02" },
      { corte: "PERSONALIZADO" as const, fechaCorte: "2026-09-01" },
    ])
    expect(ordenados.map((c) => `${c.corte}@${c.fechaCorte}`)).toEqual([
      "H24@2026-09-02",
      "D7@2026-09-08",
      "PERSONALIZADO@2026-09-01",
      "PERSONALIZADO@2026-09-03",
    ])
  })
})
