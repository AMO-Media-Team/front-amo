import { describe, expect, it } from "vitest"

import {
  CATEGORIA_RETIRADA,
  categoriasNoPermitidas,
  diferenciaCategorias,
  hayCambioCategorias,
  opcionesCategorias,
  opcionesVisibles,
} from "./categorias"

describe("diferenciaCategorias", () => {
  it("calcula qué agregar y qué quitar", () => {
    expect(diferenciaCategorias(["a", "b", "c"], ["b", "d"])).toEqual({
      agregar: ["d"],
      quitar: ["a", "c"],
    })
  })

  it("sin cambios no hay nada que escribir (el orden no importa)", () => {
    const cambio = diferenciaCategorias(["a", "b"], ["b", "a"])
    expect(cambio).toEqual({ agregar: [], quitar: [] })
    expect(hayCambioCategorias(cambio)).toBe(false)
  })

  it("de vacío a algo y de algo a vacío", () => {
    expect(diferenciaCategorias([], ["a"])).toEqual({
      agregar: ["a"],
      quitar: [],
    })
    expect(diferenciaCategorias(["a"], [])).toEqual({
      agregar: [],
      quitar: ["a"],
    })
    expect(hayCambioCategorias({ agregar: [], quitar: ["a"] })).toBe(true)
  })
})

describe("categoriasNoPermitidas", () => {
  it("solo se pueden agregar categorías activas", () => {
    expect(categoriasNoPermitidas(["a", "x"], ["a", "b"])).toEqual(["x"])
    expect(categoriasNoPermitidas(["a", "b"], new Set(["a", "b"]))).toEqual([])
  })

  it("una archivada que el medio ya tenía se puede conservar", () => {
    expect(categoriasNoPermitidas(["a", "vieja"], ["a"], ["vieja"])).toEqual([])
    expect(categoriasNoPermitidas(["otra"], ["a"], ["vieja"])).toEqual(["otra"])
  })
})

describe("opcionesCategorias", () => {
  it("pone las activas en su orden y al final las archivadas del medio, marcadas", () => {
    const activas = [
      { id: "1", nombre: "Noticias generales" },
      { id: "2", nombre: "Deportes" },
    ]
    const delMedio = [
      { id: "2", nombre: "Deportes" },
      { id: "9", nombre: "Política" },
      { id: "8", nombre: "Humor" },
    ]
    expect(opcionesCategorias(activas, delMedio)).toEqual([
      { id: "1", nombre: "Noticias generales" },
      { id: "2", nombre: "Deportes" },
      { id: "8", nombre: "Humor", archivada: true },
      { id: "9", nombre: "Política", archivada: true },
    ])
  })

  it("sin categorías del medio, solo las activas", () => {
    const activas = [{ id: "1", nombre: "Cultura" }]
    expect(opcionesCategorias(activas, [])).toEqual(activas)
  })
})

describe("opcionesVisibles", () => {
  const opciones = [
    { id: "1", nombre: "Cultura" },
    { id: "2", nombre: "Deportes" },
  ]

  it("sin elegidas fuera del catálogo, las mismas opciones", () => {
    expect(opcionesVisibles(opciones, ["2"])).toEqual(opciones)
  })

  it("una elegida que desapareció de las opciones sigue a la vista, señalada, para poder desmarcarla", () => {
    expect(opcionesVisibles(opciones, ["2", "9"])).toEqual([
      ...opciones,
      { id: "9", nombre: CATEGORIA_RETIRADA, retirada: true },
    ])
    expect(opcionesVisibles([], ["9"])).toEqual([
      { id: "9", nombre: CATEGORIA_RETIRADA, retirada: true },
    ])
  })
})
