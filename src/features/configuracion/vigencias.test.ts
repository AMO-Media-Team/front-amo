import { describe, expect, it } from "vitest"

import {
  diaAnterior,
  diaSiguiente,
  diaYHora,
  estadoVigencia,
  estadoVigenciaDias,
  finExclusivoDelDia,
  formatearDia,
  hoyBogota,
  inicioPreset,
  instanteBogota,
  textoVigencia,
  textoVigenciaDias,
  ultimoDiaIncluido,
} from "./vigencias"

const ESPACIO = /[\s  ]/g
const limpio = (texto: string) => texto.replace(ESPACIO, " ")

// Lunes 5 de octubre de 2026, 10:00 en Bogotá (UTC−5).
const AHORA = new Date("2026-10-05T15:00:00Z")

describe("estadoVigencia", () => {
  it("clasifica un rango de instantes semiabierto [desde, hasta)", () => {
    expect(estadoVigencia("2026-10-06T05:00:00Z", null, AHORA)).toBe(
      "PROGRAMADA"
    )
    expect(estadoVigencia("2026-01-01T05:00:00Z", null, AHORA)).toBe("VIGENTE")
    expect(
      estadoVigencia("2026-01-01T05:00:00Z", "2026-10-06T05:00:00Z", AHORA)
    ).toBe("VIGENTE")
    expect(
      estadoVigencia("2026-01-01T05:00:00Z", "2026-10-01T05:00:00Z", AHORA)
    ).toBe("FINALIZADA")
  })

  it("el instante de inicio ya es vigente y el de fin ya no lo es", () => {
    const instante = AHORA.toISOString()
    expect(estadoVigencia(instante, null, AHORA)).toBe("VIGENTE")
    expect(estadoVigencia("2026-01-01T05:00:00Z", instante, AHORA)).toBe(
      "FINALIZADA"
    )
  })
})

describe("estadoVigenciaDias", () => {
  it("usa el día de Bogotá, no el de UTC", () => {
    // 23:30 del 5 de octubre en Bogotá ya es 6 de octubre en UTC.
    const noche = new Date("2026-10-06T04:30:00Z")
    expect(estadoVigenciaDias("2026-10-06", null, noche)).toBe("PROGRAMADA")
    expect(estadoVigenciaDias("2026-10-05", null, noche)).toBe("VIGENTE")
  })

  it("el fin es exclusivo", () => {
    expect(estadoVigenciaDias("2026-01-01", "2026-10-05", AHORA)).toBe(
      "FINALIZADA"
    )
    expect(estadoVigenciaDias("2026-01-01", "2026-10-06", AHORA)).toBe(
      "VIGENTE"
    )
  })
})

describe("instantes en Bogotá", () => {
  it("convierte día y hora de Colombia a un instante", () => {
    expect(instanteBogota("2026-11-01")?.toISOString()).toBe(
      "2026-11-01T05:00:00.000Z"
    )
    expect(instanteBogota("2026-11-01", "18:30")?.toISOString()).toBe(
      "2026-11-01T23:30:00.000Z"
    )
  })

  it("rechaza días u horas inválidos", () => {
    expect(instanteBogota("", "08:00")).toBeNull()
    expect(instanteBogota("2026-02-30")).toBeNull()
    expect(instanteBogota("2026-11-01", "24:00")).toBeNull()
    expect(instanteBogota("2026-11-01", "8am")).toBeNull()
  })

  it("devuelve el día y la hora de Bogotá de un instante", () => {
    expect(diaYHora("2026-11-01T23:30:00Z")).toEqual({
      dia: "2026-11-01",
      hora: "18:30",
    })
    expect(diaYHora("2026-11-02T04:59:00Z")).toEqual({
      dia: "2026-11-01",
      hora: "23:59",
    })
  })

  it("«hasta el día X inclusive» termina a las 00:00 del día siguiente", () => {
    const fin = finExclusivoDelDia("2026-12-31")
    expect(fin?.toISOString()).toBe("2027-01-01T05:00:00.000Z")
    expect(ultimoDiaIncluido(fin as Date)).toBe("2026-12-31")
    expect(finExclusivoDelDia("no-es-fecha")).toBeNull()
  })

  it("mueve días de calendario sin depender de la zona del servidor", () => {
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01")
    expect(diaAnterior("2026-03-01")).toBe("2026-02-28")
    expect(diaSiguiente("nada")).toBeNull()
    expect(hoyBogota(new Date("2026-10-06T04:30:00Z"))).toBe("2026-10-05")
  })
})

describe("inicioPreset", () => {
  it("calcula mañana, el próximo lunes y el primero del mes a las 00:00 de Bogotá", () => {
    expect(inicioPreset("manana", AHORA).toISOString()).toBe(
      "2026-10-06T05:00:00.000Z"
    )
    expect(inicioPreset("lunes", AHORA).toISOString()).toBe(
      "2026-10-12T05:00:00.000Z"
    )
    expect(inicioPreset("mes", AHORA).toISOString()).toBe(
      "2026-11-01T05:00:00.000Z"
    )
  })

  it("un lunes propone el lunes siguiente y un domingo, el día siguiente", () => {
    const domingo = new Date("2026-10-04T15:00:00Z")
    expect(inicioPreset("lunes", domingo).toISOString()).toBe(
      "2026-10-05T05:00:00.000Z"
    )
  })

  it("cruza el cambio de año", () => {
    const diciembre = new Date("2026-12-15T15:00:00Z")
    expect(inicioPreset("mes", diciembre).toISOString()).toBe(
      "2027-01-01T05:00:00.000Z"
    )
  })
})

describe("textos de vigencia", () => {
  it("muestra el último día incluido, no el fin exclusivo", () => {
    expect(limpio(textoVigencia("2026-01-01T05:00:00Z", null))).toBe(
      "Desde el 1 de ene de 2026"
    )
    expect(
      limpio(textoVigencia("2026-01-01T05:00:00Z", "2026-11-01T05:00:00Z"))
    ).toBe("1 de ene de 2026 – 31 de oct de 2026")
  })

  it("un día de una columna `date` no retrocede al pasar por UTC", () => {
    // `new Date("2026-01-01")` es medianoche UTC: en Bogotá sería 31 de dic.
    expect(limpio(formatearDia("2026-01-01"))).toBe("1 de ene de 2026")
    expect(limpio(formatearDia("2026-12-31", "largo"))).toBe(
      "31 de diciembre de 2026"
    )
    expect(formatearDia(null)).toBe("—")
    expect(formatearDia("no es fecha")).toBe("—")
  })

  it("hace lo mismo con columnas de día", () => {
    expect(limpio(textoVigenciaDias("2026-01-01", null))).toBe(
      "Desde el 1 de ene de 2026"
    )
    expect(limpio(textoVigenciaDias("2026-01-01", "2027-01-01"))).toBe(
      "1 de ene de 2026 – 31 de dic de 2026"
    )
  })
})
