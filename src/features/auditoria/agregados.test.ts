import { describe, expect, it } from "vitest"

import { parsearFecha, rangoPersonalizado } from "@/lib/fechas"

import {
  contarPor,
  rangosDePaginas,
  serieTemporal,
  tamanoTramo,
} from "./agregados"

const rango = (desde: string, hasta: string) =>
  rangoPersonalizado(parsearFecha(desde)!, parsearFecha(hasta)!)

describe("rangosDePaginas", () => {
  it("trocea en páginas de 1.000 hasta el máximo", () => {
    expect(rangosDePaginas(0, 10_000)).toEqual([])
    expect(rangosDePaginas(1, 10_000)).toEqual([[0, 0]])
    expect(rangosDePaginas(2500, 10_000)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ])
    expect(rangosDePaginas(50_000, 1500, 1000)).toEqual([
      [0, 999],
      [1000, 1499],
    ])
  })
})

describe("contarPor", () => {
  it("de mayor a menor, ignora claves nulas y desempata por aparición", () => {
    const filas = ["b", "a", null, "a", "c", "b", undefined, "a"]
    expect(contarPor(filas, (f) => f)).toEqual([
      { clave: "a", cantidad: 3 },
      { clave: "b", cantidad: 2 },
      { clave: "c", cantidad: 1 },
    ])
  })
})

describe("serieTemporal", () => {
  it("un punto por día de Bogotá con ceros donde no hubo actividad", () => {
    const serie = serieTemporal(
      [
        "2026-09-01T05:00:00Z", // 00:00 del 1 en Bogotá
        "2026-09-01T04:59:00Z", // 23:59 del 31-ago: fuera
        "2026-09-03T23:00:00Z",
        "2026-09-03T12:00:00Z",
      ],
      rango("2026-09-01", "2026-09-03")
    )
    expect(serie).toEqual([1, 0, 2])
  })

  it("semanal cuando el periodo pasa de 31 días", () => {
    const largo = rango("2026-01-01", "2026-03-31")
    expect(tamanoTramo(largo)).toBe(7)
    expect(tamanoTramo(rango("2026-09-01", "2026-09-30"))).toBe(1)
    const serie = serieTemporal(
      ["2026-01-08T15:00:00Z", "2026-03-31T15:00:00Z"],
      largo
    )
    expect(serie).toHaveLength(13)
    expect(serie[1]).toBe(1)
    expect(serie.at(-1)).toBe(1)
  })
})
