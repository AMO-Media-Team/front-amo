import { describe, expect, it } from "vitest"

import {
  completarCubetas,
  cruzaDeAnio,
  cubetasDelRango,
  diaCalendario,
  etiquetaPeriodo,
  etiquetasPeriodos,
} from "./series"

describe("diaCalendario", () => {
  it("lee 'YYYY-MM-DD' como el día de calendario en UTC", () => {
    expect(diaCalendario("2026-09-14")?.toISOString()).toBe(
      "2026-09-14T00:00:00.000Z"
    )
  })

  it("rechaza fechas imposibles y textos que no son días", () => {
    expect(diaCalendario("2026-02-30")).toBeNull()
    expect(diaCalendario("2026-9-1")).toBeNull()
    expect(diaCalendario("2026-09-14T00:00:00Z")).toBeNull()
  })
})

describe("etiquetaPeriodo", () => {
  it("día, semana y mes sin preposiciones ni punto final", () => {
    expect(etiquetaPeriodo("2026-09-14", "dia")).toBe("14 sept")
    expect(etiquetaPeriodo("2026-09-14", "semana")).toBe("Sem. 14 sept")
    expect(etiquetaPeriodo("2026-09-01", "mes")).toBe("sept")
    expect(etiquetaPeriodo("2026-09-01", "mes", true)).toBe("sept 2026")
  })

  it("devuelve el texto tal cual si no es una fecha", () => {
    expect(etiquetaPeriodo("sin-fecha", "dia")).toBe("sin-fecha")
  })

  it("añade el año a los meses solo si el eje cruza de año", () => {
    expect(cruzaDeAnio(["2026-01-01", "2026-12-01"])).toBe(false)
    expect(cruzaDeAnio(["2025-12-01", "2026-01-01"])).toBe(true)
    expect(etiquetasPeriodos(["2025-12-01", "2026-01-01"], "mes")).toEqual([
      "dic 2025",
      "ene 2026",
    ])
    expect(etiquetasPeriodos(["2026-01-01", "2026-02-01"], "mes")).toEqual([
      "ene",
      "feb",
    ])
  })
})

describe("cubetasDelRango", () => {
  it("un día por cubeta hasta 31 días", () => {
    const cubetas = cubetasDelRango("2026-09-01", "2026-10-01")
    expect(cubetas).toHaveLength(31)
    expect(cubetas.at(0)).toBe("2026-09-01")
    expect(cubetas.at(-1)).toBe("2026-10-01")
  })

  it("con más de 31 días, el lunes de cada semana ISO que toca el rango", () => {
    // 2026-09-01 es martes: su semana empieza el lunes 31 de agosto.
    expect(cubetasDelRango("2026-09-01", "2026-10-10")).toEqual([
      "2026-08-31",
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ])
  })

  it("sin cubetas para rangos inválidos o invertidos", () => {
    expect(cubetasDelRango("2026-10-02", "2026-10-01")).toEqual([])
    expect(cubetasDelRango("x", "2026-10-01")).toEqual([])
  })
})

describe("completarCubetas", () => {
  it("rellena las cubetas sin fila y respeta el orden del eje", () => {
    const filas = [
      { periodo: "2026-09-03", valor: 7 },
      { periodo: "2026-09-01", valor: 2 },
    ]
    const completas = completarCubetas(
      ["2026-09-01", "2026-09-02", "2026-09-03"],
      filas,
      (fila) => fila.periodo,
      (periodo) => ({ periodo, valor: 0 })
    )
    expect(completas.map((fila) => fila.valor)).toEqual([2, 0, 7])
  })
})
