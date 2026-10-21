import { describe, expect, it } from "vitest"

import type { EspecGrafico } from "../graficos"
import {
  filasGraficosPdf,
  filasRanking,
  tamanoCaptura,
  tamanosFila,
} from "./tamanos"

type Ancho = EspecGrafico["ancho"]

const dona = (
  id: string,
  ancho: Ancho = "mitad",
  vacio = false
): EspecGrafico => ({
  id,
  tipo: "dona",
  titulo: id,
  ancho,
  segmentos: [{ id: "a", nombre: "A", valor: 1 }],
  formato: "numero",
  vacio: vacio ? { titulo: "Sin datos" } : false,
})

const tendencia = (id: string): EspecGrafico => ({
  id,
  tipo: "tendencia",
  titulo: id,
  ancho: "completo",
  etiquetas: ["1", "2"],
  series: [{ id: "s", nombre: "S", valores: [1, 2] }],
  formato: "cop",
  vacio: false,
})

const ranking = (
  id: string,
  elementos: number,
  extra: Partial<Extract<EspecGrafico, { tipo: "ranking" }>> = {}
) =>
  ({
    id,
    tipo: "ranking",
    titulo: id,
    ancho: "mitad",
    elementos: Array.from({ length: elementos }, (_, i) => ({
      id: String(i),
      nombre: `Elemento ${i}`,
      valor: elementos - i,
    })),
    formato: "numero",
    nombreValor: "Valor",
    vacio: false,
    ...extra,
  }) satisfies EspecGrafico

const apiladas = (
  id: string,
  categorias: number,
  orientacion?: "horizontal"
): EspecGrafico => ({
  id,
  tipo: "apiladas",
  titulo: id,
  ancho: "mitad",
  orientacion,
  categorias: Array.from({ length: categorias }, (_, i) => `Zona ${i}`),
  series: [
    {
      id: "s",
      nombre: "S",
      valores: Array.from({ length: categorias }, () => 1),
    },
  ],
  formato: "numero",
  vacio: false,
})

const mapa = (id: string): EspecGrafico => ({
  id,
  tipo: "mapa",
  titulo: id,
  ancho: "mitad",
  capas: [{ metrica: "medios", etiqueta: "Medios", valores: { "05": 3 } }],
  destacado: null,
  vacio: false,
})

const ids = (filas: EspecGrafico[][]) =>
  filas.map((fila) => fila.map((g) => g.id))

describe("filasRanking", () => {
  it("cuenta las barras visibles y la de «Otros»", () => {
    expect(filasRanking(ranking("r", 4))).toBe(4)
    expect(filasRanking(ranking("r", 14, { limite: 10 }))).toBe(10)
    expect(
      filasRanking(ranking("r", 14, { limite: 10, agruparResto: true }))
    ).toBe(11)
    // Sin resto que agrupar no hay barra adicional.
    expect(
      filasRanking(ranking("r", 8, { limite: 10, agruparResto: true }))
    ).toBe(8)
  })
})

describe("filasGraficosPdf", () => {
  const graficos = [
    tendencia("t"),
    dona("a"),
    ranking("b", 5),
    dona("c"),
    dona("d"),
  ]

  it("en vertical cada gráfico ocupa su fila", () => {
    expect(ids(filasGraficosPdf(graficos, "vertical"))).toEqual([
      ["t"],
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ])
  })

  it("en horizontal los de media fila van de dos en dos", () => {
    expect(ids(filasGraficosPdf(graficos, "horizontal"))).toEqual([
      ["t"],
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("los gráficos sin datos no se dibujan y no rompen las parejas", () => {
    const conVacio = [dona("a"), dona("x", "mitad", true), dona("b"), dona("c")]
    // Quedan tres: una pareja y el último, que pasa a fila completa.
    expect(ids(filasGraficosPdf(conVacio, "horizontal"))).toEqual([
      ["a", "b"],
      ["c"],
    ])
    expect(filasGraficosPdf([dona("x", "mitad", true)], "horizontal")).toEqual(
      []
    )
  })

  it("el mapa nunca se empareja (lleva su leyenda al lado)", () => {
    expect(ids(filasGraficosPdf([mapa("m"), dona("a")], "horizontal"))).toEqual(
      [["m"], ["a"]]
    )
  })
})

describe("tamanoCaptura", () => {
  it("en horizontal las series son más anchas y más bajas", () => {
    expect(tamanoCaptura(tendencia("t"), "vertical")).toEqual({
      ancho: 960,
      alto: 340,
    })
    expect(tamanoCaptura(tendencia("t"), "horizontal")).toEqual({
      ancho: 1200,
      alto: 260,
    })
  })

  it("los rankings crecen con sus barras, hasta el tope de la orientación", () => {
    expect(tamanoCaptura(ranking("r", 3)).alto).toBe(200)
    expect(tamanoCaptura(ranking("r", 8)).alto).toBe(8 * 30 + 56)
    expect(tamanoCaptura(ranking("r", 40)).alto).toBe(460)
    expect(tamanoCaptura(ranking("r", 40), "horizontal").alto).toBe(280)
  })

  it("las barras apiladas horizontales reservan alto para nombrar cada barra", () => {
    const diez = tamanoCaptura(apiladas("a", 10, "horizontal"), "horizontal")
    // Más de 32 px por barra una vez descontados la leyenda y el eje.
    expect((diez.alto - 84) / 10).toBeGreaterThanOrEqual(32)
    const doce = tamanoCaptura(apiladas("a", 12, "horizontal"), "vertical")
    expect((doce.alto - 84) / 12).toBeGreaterThanOrEqual(32)
    // Verticales: alto de serie.
    expect(tamanoCaptura(apiladas("a", 12), "vertical").alto).toBe(340)
  })

  it("el mapa conserva su proporción en cualquier orientación", () => {
    expect(tamanoCaptura(mapa("m"), "vertical")).toEqual(
      tamanoCaptura(mapa("m"), "horizontal")
    )
  })
})

describe("tamanosFila", () => {
  it("un gráfico solo conserva su tamaño", () => {
    expect(tamanosFila([tendencia("t")], "horizontal")).toEqual([
      { ancho: 1200, alto: 260 },
    ])
  })

  it("una pareja comparte el alto del más alto y un ancho menor", () => {
    const [a, b] = tamanosFila(
      [dona("a"), apiladas("b", 10, "horizontal")],
      "horizontal"
    )
    expect(a).toEqual(b)
    expect(a.ancho).toBe(600)
    expect(a.alto).toBe(
      tamanoCaptura(apiladas("b", 10, "horizontal"), "horizontal").alto
    )
  })
})
