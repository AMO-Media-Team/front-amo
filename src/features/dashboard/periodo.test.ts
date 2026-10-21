import { describe, expect, it } from "vitest"

import { rangoDesdePreset } from "@/lib/fechas"

import {
  DIAS_MAXIMOS_PANEL,
  etiquetaComparacionAmplia,
  etiquetaComparacionCorta,
  granularidadPara,
  periodoPanel,
  PRESETS_PANEL,
  rangoPanel,
  textoPeriodoComparado,
  type ValoresPeriodo,
  valoresParaPreset,
  valoresParaRango,
} from "./periodo"

// 15:00 UTC = 10:00 del jueves 1 de octubre en Bogotá.
const AHORA = new Date("2026-10-01T15:00:00Z")

const valores = (parcial: Partial<ValoresPeriodo> = {}): ValoresPeriodo => ({
  periodo: null,
  desde: null,
  hasta: null,
  ...parcial,
})

describe("rangoPanel", () => {
  it("sin parámetros rige el preset del panel", () => {
    expect(rangoPanel(valores(), "esteMes", AHORA).preset).toBe("esteMes")
    expect(rangoPanel(valores(), "ultimos30", AHORA).preset).toBe("ultimos30")
  })

  it("un preset explícito gana, aunque no esté en el selector (hoy)", () => {
    expect(
      rangoPanel(valores({ periodo: "hoy" }), "esteMes", AHORA).preset
    ).toBe("hoy")
  })

  it("acepta un rango personalizado, también sin `periodo` (enlaces de insights)", () => {
    const conPreset = periodoPanel(
      valores({
        periodo: "personalizado",
        desde: "2026-08-01",
        hasta: "2026-08-31",
      }),
      "ultimos30",
      AHORA
    )
    expect([conPreset.desde, conPreset.hasta]).toEqual([
      "2026-08-01",
      "2026-08-31",
    ])
    const soloFechas = periodoPanel(
      valores({ desde: "2026-08-01", hasta: "2026-08-31" }),
      "ultimos30",
      AHORA
    )
    expect(soloFechas.rango.preset).toBe("personalizado")
  })

  it("descarta rangos de más de dos años o incompletos", () => {
    const largo = rangoPanel(
      valores({
        periodo: "personalizado",
        desde: "2020-01-01",
        hasta: "2026-01-01",
      }),
      "ultimos30",
      AHORA
    )
    expect(largo.preset).toBe("ultimos30")
    const incompleto = rangoPanel(
      valores({ periodo: "personalizado", desde: "2026-08-01" }),
      "esteMes",
      AHORA
    )
    expect(incompleto.preset).toBe("esteMes")
    expect(DIAS_MAXIMOS_PANEL).toBe(731)
  })
})

describe("periodoPanel", () => {
  it("serializa el periodo y su comparativo para las RPC", () => {
    const periodo = periodoPanel(valores(), "ultimos30", AHORA)
    expect(periodo).toMatchObject({
      desde: "2026-09-02",
      hasta: "2026-10-01",
      desdeAnterior: "2026-08-03",
      hastaAnterior: "2026-09-01",
      dias: 30,
    })
  })

  it("este mes se compara con los mismos días del mes anterior", () => {
    const periodo = periodoPanel(valores(), "esteMes", AHORA)
    expect([periodo.desde, periodo.hasta]).toEqual(["2026-10-01", "2026-10-01"])
    expect([periodo.desdeAnterior, periodo.hastaAnterior]).toEqual([
      "2026-09-01",
      "2026-09-01",
    ])
    expect(textoPeriodoComparado(periodo.anterior)).toBe("1 de sept de 2026")
  })
})

describe("granularidadPara", () => {
  it.each([
    [1, "dia"],
    [31, "dia"],
    [32, "semana"],
    [183, "semana"],
    [184, "mes"],
  ] as const)("%i días → %s", (dias, granularidad) => {
    expect(granularidadPara(dias)).toBe(granularidad)
  })
})

describe("etiquetas de comparación", () => {
  it.each([
    ["ultimos7", "vs. 7 días previos"],
    ["ultimos30", "vs. 30 días previos"],
    ["esteMes", "vs. sept a la fecha"],
    ["mesAnterior", "vs. agosto"],
    ["esteTrimestre", "vs. trim. anterior"],
    ["esteAno", "vs. año pasado"],
    ["hoy", "vs. ayer"],
  ] as const)("corta: %s → %s", (preset, texto) => {
    expect(etiquetaComparacionCorta(rangoDesdePreset(preset, AHORA))).toBe(
      texto
    )
  })

  it("la corta cabe junto al sparkline: dos líneas de hasta 11 caracteres", () => {
    for (const preset of [...PRESETS_PANEL, "hoy"] as const) {
      const etiqueta = etiquetaComparacionCorta(rangoDesdePreset(preset, AHORA))
      const lineas = etiqueta.split(" ").reduce<string[]>((hechas, palabra) => {
        const ultima = hechas.at(-1)
        if (ultima !== undefined && `${ultima} ${palabra}`.length <= 11) {
          return [...hechas.slice(0, -1), `${ultima} ${palabra}`]
        }
        return [...hechas, palabra]
      }, [])
      expect(lineas.length, etiqueta).toBeLessThanOrEqual(2)
    }
  })

  it.each([
    ["esteMes", "vs. mismos días de septiembre"],
    ["esteTrimestre", "vs. trimestre anterior"],
    ["esteAno", "vs. mismo tramo del año pasado"],
    ["ultimos30", "vs. 30 días previos"],
  ] as const)("amplia: %s → %s", (preset, texto) => {
    expect(etiquetaComparacionAmplia(rangoDesdePreset(preset, AHORA))).toBe(
      texto
    )
  })
})

describe("valores de URL", () => {
  it("el preset del panel deja la URL limpia; los demás la escriben", () => {
    expect(valoresParaPreset("esteMes", "esteMes")).toEqual(valores())
    expect(valoresParaPreset("ultimos7", "esteMes")).toEqual(
      valores({ periodo: "ultimos7" })
    )
  })

  it("un rango del calendario se escribe como personalizado", () => {
    const rango = periodoPanel(
      valores({ desde: "2026-08-01", hasta: "2026-08-31" }),
      "ultimos30",
      AHORA
    ).rango
    expect(valoresParaRango(rango)).toEqual({
      periodo: "personalizado",
      desde: "2026-08-01",
      hasta: "2026-08-31",
    })
  })
})
