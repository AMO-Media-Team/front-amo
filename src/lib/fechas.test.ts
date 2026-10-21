import { describe, expect, it } from "vitest"

import {
  type PresetAutomatico,
  type RangoFechas,
  diasEnRango,
  esPresetRango,
  inicioDelDia,
  instantesDelRango,
  parsearFecha,
  parsearRango,
  periodoAnterior,
  rangoDesdePreset,
  rangoPersonalizado,
  serializarFecha,
  serializarRango,
} from "./fechas"

// 03:00 UTC del 30-sep = 22:00 del 29-sep en Bogotá: "hoy" es el 29.
const AHORA = new Date("2026-09-30T03:00:00Z")

const dias = (rango: RangoFechas) => {
  const { desde, hasta } = serializarRango(rango)
  return [desde, hasta]
}

const rango = (desde: string, hasta: string): RangoFechas =>
  rangoPersonalizado(parsearFecha(desde)!, parsearFecha(hasta)!)

describe("serialización", () => {
  it("serializa el día de calendario de Bogotá", () => {
    expect(serializarFecha(AHORA)).toBe("2026-09-29")
    expect(serializarFecha(new Date("2026-09-30T05:00:00Z"))).toBe("2026-09-30")
  })

  it("parsea 'YYYY-MM-DD' como medianoche de Bogotá", () => {
    expect(parsearFecha("2026-09-29")?.toISOString()).toBe(
      "2026-09-29T05:00:00.000Z"
    )
  })

  it.each(["2026-02-30", "2026-13-01", "29/09/2026", "", null, undefined])(
    "rechaza %s",
    (texto) => {
      expect(parsearFecha(texto)).toBeNull()
    }
  )

  it("es reversible", () => {
    for (const texto of ["2024-02-29", "2026-01-01", "2026-12-31"]) {
      expect(serializarFecha(parsearFecha(texto)!)).toBe(texto)
    }
  })

  it("devuelve Date planos", () => {
    expect(inicioDelDia(AHORA).constructor).toBe(Date)
    expect(rangoDesdePreset("esteMes", AHORA).desde.constructor).toBe(Date)
  })
})

describe("rangoDesdePreset", () => {
  it.each<[PresetAutomatico, string, string]>([
    ["hoy", "2026-09-29", "2026-09-29"],
    ["ultimos7", "2026-09-23", "2026-09-29"],
    ["ultimos30", "2026-08-31", "2026-09-29"],
    ["esteMes", "2026-09-01", "2026-09-29"],
    ["mesAnterior", "2026-08-01", "2026-08-31"],
    ["esteTrimestre", "2026-07-01", "2026-09-29"],
    ["esteAno", "2026-01-01", "2026-09-29"],
  ])("%s → %s … %s", (preset, desde, hasta) => {
    const resultado = rangoDesdePreset(preset, AHORA)
    expect(resultado.preset).toBe(preset)
    expect(dias(resultado)).toEqual([desde, hasta])
  })

  it("cuenta días inclusivos", () => {
    expect(diasEnRango(rangoDesdePreset("hoy", AHORA))).toBe(1)
    expect(diasEnRango(rangoDesdePreset("ultimos30", AHORA))).toBe(30)
  })
})

describe("rangoPersonalizado", () => {
  it("ordena extremos invertidos", () => {
    expect(dias(rango("2026-09-10", "2026-09-01"))).toEqual([
      "2026-09-01",
      "2026-09-10",
    ])
  })
})

describe("periodoAnterior", () => {
  it("compara días contra los N días previos", () => {
    expect(dias(periodoAnterior(rangoDesdePreset("hoy", AHORA)))).toEqual([
      "2026-09-28",
      "2026-09-28",
    ])
    expect(dias(periodoAnterior(rangoDesdePreset("ultimos7", AHORA)))).toEqual([
      "2026-09-16",
      "2026-09-22",
    ])
    expect(dias(periodoAnterior(rango("2026-03-01", "2026-03-10")))).toEqual([
      "2026-02-19",
      "2026-02-28",
    ])
  })

  it("compara el mes en curso con el mismo tramo del mes anterior", () => {
    expect(dias(periodoAnterior(rangoDesdePreset("esteMes", AHORA)))).toEqual([
      "2026-08-01",
      "2026-08-29",
    ])
  })

  it("compara meses completos con meses completos", () => {
    expect(
      dias(periodoAnterior(rangoDesdePreset("mesAnterior", AHORA)))
    ).toEqual(["2026-07-01", "2026-07-31"])
    const marzo = rangoDesdePreset(
      "mesAnterior",
      new Date("2026-04-15T12:00:00Z")
    )
    expect(dias(periodoAnterior(marzo))).toEqual(["2026-02-01", "2026-02-28"])
  })

  it("compara trimestre y año con sus homólogos", () => {
    expect(
      dias(periodoAnterior(rangoDesdePreset("esteTrimestre", AHORA)))
    ).toEqual(["2026-04-01", "2026-06-29"])
    expect(dias(periodoAnterior(rangoDesdePreset("esteAno", AHORA)))).toEqual([
      "2025-01-01",
      "2025-09-29",
    ])
  })

  it("marca el periodo anterior como personalizado", () => {
    expect(periodoAnterior(rangoDesdePreset("hoy", AHORA)).preset).toBe(
      "personalizado"
    )
  })
})

describe("instantesDelRango", () => {
  it("cubre días completos de Bogotá con fin exclusivo", () => {
    expect(instantesDelRango(rango("2026-09-01", "2026-09-30"))).toEqual({
      desde: "2026-09-01T05:00:00.000Z",
      hastaExclusivo: "2026-10-01T05:00:00.000Z",
    })
  })
})

describe("parsearRango", () => {
  it("recalcula los presets automáticos con la fecha actual", () => {
    const resultado = parsearRango(
      { preset: "ultimos7", desde: "2020-01-01", hasta: "2020-01-02" },
      AHORA
    )
    expect(dias(resultado)).toEqual(["2026-09-23", "2026-09-29"])
  })

  it("respeta rangos personalizados válidos", () => {
    const resultado = parsearRango(
      { preset: "personalizado", desde: "2026-05-01", hasta: "2026-05-31" },
      AHORA
    )
    expect(resultado.preset).toBe("personalizado")
    expect(dias(resultado)).toEqual(["2026-05-01", "2026-05-31"])
  })

  it("acepta desde/hasta sin preset", () => {
    expect(
      parsearRango({ desde: "2026-05-01", hasta: "2026-05-02" }, AHORA).preset
    ).toBe("personalizado")
  })

  it("cae al preset por defecto ante entradas inválidas", () => {
    for (const valores of [
      {},
      { preset: "otro" },
      { preset: "personalizado", desde: "2026-02-30", hasta: "2026-03-01" },
    ]) {
      const resultado = parsearRango(valores, AHORA)
      expect(resultado.preset).toBe("ultimos30")
    }
  })

  it("reconoce los presets válidos", () => {
    expect(esPresetRango("esteAno")).toBe(true)
    expect(esPresetRango("anual")).toBe(false)
  })
})
