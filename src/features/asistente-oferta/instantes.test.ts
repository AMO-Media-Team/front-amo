import { describe, expect, it } from "vitest"

import {
  combinarFechaHora,
  finDeCampana,
  inicioDeCampana,
  instante,
  instantesPorDefecto,
  minimoFechaLimite,
  separarFechaHora,
} from "./instantes"

// Bogotá es UTC−5 todo el año (sin horario de verano).
describe("día y hora de Bogotá ↔ timestamptz", () => {
  it("combina día y hora de Colombia en un instante UTC", () => {
    expect(combinarFechaHora("2026-11-03", "18:30")).toBe(
      "2026-11-03T23:30:00.000Z"
    )
    // Pasada la medianoche UTC sigue siendo el mismo día en Bogotá.
    expect(combinarFechaHora("2026-11-03", "23:59")).toBe(
      "2026-11-04T04:59:00.000Z"
    )
  })

  it("no combina si falta o no vale el día o la hora", () => {
    expect(combinarFechaHora("", "08:00")).toBeNull()
    expect(combinarFechaHora("2026-11-03", "")).toBeNull()
    expect(combinarFechaHora("2026-02-30", "08:00")).toBeNull()
    expect(combinarFechaHora("2026-11-03", "25:00")).toBeNull()
  })

  it("separa un instante en el día y la hora de Bogotá", () => {
    expect(separarFechaHora("2026-11-04T04:59:00.000Z")).toEqual({
      dia: "2026-11-03",
      hora: "23:59",
    })
    expect(separarFechaHora("")).toEqual({ dia: "", hora: "" })
    expect(separarFechaHora("no es fecha")).toEqual({ dia: "", hora: "" })
  })

  it("ida y vuelta conserva el valor", () => {
    const iso = combinarFechaHora("2026-12-31", "07:15")!
    expect(separarFechaHora(iso)).toEqual({ dia: "2026-12-31", hora: "07:15" })
  })

  it("lee instantes y descarta lo inválido", () => {
    expect(instante("2026-11-03T12:00:00Z")?.toISOString()).toBe(
      "2026-11-03T12:00:00.000Z"
    )
    expect(instante("")).toBeNull()
    expect(instante(null)).toBeNull()
    expect(instante("mañana")).toBeNull()
  })
})

describe("límites de la campaña", () => {
  it("empieza a las 00:00 de su primer día y termina antes de las 00:00 del siguiente al último", () => {
    expect(inicioDeCampana("2026-11-01")?.toISOString()).toBe(
      "2026-11-01T05:00:00.000Z"
    )
    expect(finDeCampana("2026-11-30")?.toISOString()).toBe(
      "2026-12-01T05:00:00.000Z"
    )
    expect(finDeCampana("no")).toBeNull()
  })

  it("la fecha límite queda al menos la anticipación después de ahora", () => {
    const ahora = new Date("2026-10-22T15:12:00Z")
    expect(minimoFechaLimite(ahora, 24).toISOString()).toBe(
      "2026-10-23T15:12:00.000Z"
    )
    expect(minimoFechaLimite(ahora, 0).toISOString()).toBe(ahora.toISOString())
  })
})

describe("instantesPorDefecto", () => {
  const ahora = new Date("2026-10-22T15:12:00Z") // 10:12 a. m. en Bogotá

  it("cubre lo que queda de la campaña y deja la fecha límite en punto tras la anticipación", () => {
    const valores = instantesPorDefecto({
      fechaInicio: "2026-10-01",
      fechaFin: "2026-11-30",
      anticipacionHoras: 24,
      ahora,
    })
    expect(valores.ventanaInicio).toBe("2026-10-22T05:00:00.000Z") // hoy 00:00
    expect(separarFechaHora(valores.ventanaFin)).toEqual({
      dia: "2026-11-30",
      hora: "23:59",
    })
    // 24 h + 1 h de margen, a la hora en punto siguiente: 23 oct, 12:00 m.
    expect(valores.fechaLimite).toBe("2026-10-23T17:00:00.000Z")
  })

  it("una campaña futura empieza en su primer día", () => {
    const valores = instantesPorDefecto({
      fechaInicio: "2026-11-10",
      fechaFin: "2026-11-30",
      anticipacionHoras: 0,
      ahora,
    })
    expect(separarFechaHora(valores.ventanaInicio)).toEqual({
      dia: "2026-11-10",
      hora: "00:00",
    })
  })

  it("la fecha límite nunca pasa del fin de la ventana", () => {
    const valores = instantesPorDefecto({
      fechaInicio: "2026-10-22",
      fechaFin: "2026-10-22",
      anticipacionHoras: 24,
      ahora,
    })
    expect(valores.fechaLimite).toBe(valores.ventanaFin)
  })
})
