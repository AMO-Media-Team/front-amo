import { describe, expect, it } from "vitest"

import {
  alinearSerie,
  distribuirAnchos,
  etiquetaPeriodo,
  granularidadPara,
  sinValores,
} from "./graficos"

const anchos = (...lista: ("completo" | "mitad")[]) =>
  distribuirAnchos(lista.map((ancho) => ({ ancho })))

describe("granularidadPara", () => {
  it("un punto por día hasta un mes, por semana hasta ~4 meses y luego por mes", () => {
    expect(granularidadPara(1)).toBe("dia")
    expect(granularidadPara(31)).toBe("dia")
    expect(granularidadPara(32)).toBe("semana")
    expect(granularidadPara(120)).toBe("semana")
    expect(granularidadPara(121)).toBe("mes")
    expect(granularidadPara(460)).toBe("mes")
  })
})

describe("etiquetaPeriodo", () => {
  it("nombra el tramo según la granularidad", () => {
    expect(etiquetaPeriodo("2026-09-12", "dia")).toBe("12 de sept")
    expect(etiquetaPeriodo("2026-09-07", "semana")).toBe("Sem. 7 de sept")
    expect(etiquetaPeriodo("2026-09-01", "mes")).toMatch(/^sept.+26$/)
  })

  it("no corre el día por la zona horaria", () => {
    expect(etiquetaPeriodo("2026-01-01", "dia")).toBe("1 de ene")
    expect(etiquetaPeriodo("2026-12-31", "dia")).toBe("31 de dic")
  })

  it("un periodo ilegible se muestra tal cual", () => {
    expect(etiquetaPeriodo("pronto", "dia")).toBe("pronto")
  })
})

describe("alinearSerie", () => {
  it("empareja por posición: rellena lo que falta y descarta lo que sobra", () => {
    expect(alinearSerie([1, 2], 4)).toEqual([1, 2, null, null])
    expect(alinearSerie([1, 2, 3, 4], 2)).toEqual([1, 2])
    expect(alinearSerie([], 2)).toEqual([null, null])
    expect(alinearSerie([0, null, 5], 3)).toEqual([0, null, 5])
  })
})

describe("sinValores", () => {
  it("un gráfico solo con ceros o vacíos no dice nada", () => {
    expect(sinValores([])).toBe(true)
    expect(sinValores([0, null, 0])).toBe(true)
    expect(sinValores([0, 0.01])).toBe(false)
    expect(sinValores([-5])).toBe(false)
  })
})

describe("distribuirAnchos", () => {
  it("respeta las parejas de media fila", () => {
    expect(anchos("completo", "mitad", "mitad")).toEqual([
      "completo",
      "mitad",
      "mitad",
    ])
    expect(anchos("mitad", "mitad", "mitad", "mitad")).toEqual([
      "mitad",
      "mitad",
      "mitad",
      "mitad",
    ])
  })

  it("un gráfico de media fila que quedaría solo ocupa la fila entera", () => {
    expect(anchos("mitad")).toEqual(["completo"])
    expect(anchos("mitad", "mitad", "mitad")).toEqual([
      "mitad",
      "mitad",
      "completo",
    ])
    expect(anchos("mitad", "completo", "mitad", "mitad")).toEqual([
      "completo",
      "completo",
      "mitad",
      "mitad",
    ])
    expect(anchos("completo", "mitad", "completo")).toEqual([
      "completo",
      "completo",
      "completo",
    ])
  })

  it("no modifica la lista de entrada", () => {
    const entrada = [{ ancho: "mitad" as const }]
    distribuirAnchos(entrada)
    expect(entrada[0].ancho).toBe("mitad")
    expect(distribuirAnchos([])).toEqual([])
  })
})
