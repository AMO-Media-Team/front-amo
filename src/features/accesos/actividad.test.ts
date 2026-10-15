import { describe, expect, it } from "vitest"

import { celdaPico, celdasActividad, diaYHora } from "./actividad"

describe("diaYHora", () => {
  it("día ISO y hora de Bogotá (UTC−5), no de UTC", () => {
    // Jueves 1-oct 03:00 UTC = miércoles 30-sep 22:00 en Bogotá.
    expect(diaYHora("2026-10-01T03:00:00Z")).toEqual({ diaSemana: 3, hora: 22 })
    // Domingo 4-oct 05:00 UTC = domingo 00:00 en Bogotá.
    expect(diaYHora("2026-10-04T05:00:00Z")).toEqual({ diaSemana: 7, hora: 0 })
    // Lunes 5-oct 04:59 UTC = domingo 23:59.
    expect(diaYHora("2026-10-05T04:59:00Z")).toEqual({ diaSemana: 7, hora: 23 })
    expect(diaYHora("no es fecha")).toBeNull()
  })
})

describe("celdasActividad", () => {
  it("cuenta por celda día × hora y omite las vacías", () => {
    const celdas = celdasActividad([
      "2026-09-30T19:10:00Z",
      "2026-09-30T19:50:00Z",
      "2026-09-28T13:00:00Z",
      "x",
    ])
    expect(celdas).toEqual([
      { diaSemana: 3, hora: 14, cantidad: 2 },
      { diaSemana: 1, hora: 8, cantidad: 1 },
    ])
    expect(celdaPico(celdas)).toEqual({ diaSemana: 3, hora: 14, cantidad: 2 })
    expect(celdaPico([])).toBeNull()
  })
})
