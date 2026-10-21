import { describe, expect, it } from "vitest"

import {
  completarMatriz,
  conversionesEmbudo,
  franjaHoraria,
  ID_OTROS,
  mayorCaida,
  ordenarPorValor,
  prepararRanking,
  prepararSegmentos,
} from "./datos"

const elemento = (id: string, valor: number, nombre = id) => ({
  id,
  nombre,
  valor,
})

describe("ordenarPorValor", () => {
  it("de mayor a menor y, en empate, por nombre (sin tildes ni mayúsculas)", () => {
    const orden = ordenarPorValor([
      elemento("b", 5, "Bolívar"),
      elemento("a", 5, "antioquia"),
      elemento("c", 9, "Cauca"),
    ])
    expect(orden.map((e) => e.id)).toEqual(["c", "a", "b"])
  })
})

describe("prepararRanking", () => {
  const elementos = [
    elemento("a", 10),
    elemento("b", 40),
    elemento("c", 30),
    elemento("d", 20),
    elemento("x", Number.NaN),
  ]

  it("devuelve el top N ordenado y descarta valores no numéricos", () => {
    expect(prepararRanking(elementos, 2).map((e) => e.id)).toEqual(["b", "c"])
  })

  it("agrupa el resto en «Otros» al final, con su cantidad", () => {
    const filas = prepararRanking(elementos, 2, true)
    expect(filas.at(-1)).toEqual({
      id: ID_OTROS,
      nombre: "Otros (2)",
      valor: 30,
    })
  })

  it("sin resto no agrega «Otros» y un límite negativo no devuelve nada", () => {
    expect(prepararRanking(elementos, 10, true)).toHaveLength(4)
    expect(prepararRanking(elementos, -1)).toEqual([])
  })
})

describe("prepararSegmentos", () => {
  it("conserva el orden de entrada (el color sigue a la entidad)", () => {
    const segmentos = [
      elemento("ig", 20),
      elemento("fb", 50),
      elemento("tt", 30),
    ]
    expect(prepararSegmentos(segmentos).map((s) => s.id)).toEqual([
      "ig",
      "fb",
      "tt",
    ])
  })

  it("descarta ceros y pliega los menores en «Otros» por encima del máximo", () => {
    const segmentos = [
      elemento("a", 50),
      elemento("b", 2),
      elemento("c", 40),
      elemento("d", 1),
      elemento("e", 30),
      elemento("f", 0),
    ]
    const resultado = prepararSegmentos(segmentos, 3)
    expect(resultado.map((s) => s.id)).toEqual(["a", "c", ID_OTROS])
    expect(resultado.at(-1)?.valor).toBe(33)
  })
})

describe("conversionesEmbudo y mayorCaida", () => {
  const etapas = [
    { id: "vistas", nombre: "Vistas", cantidad: 1000 },
    { id: "aceptadas", nombre: "Aceptadas", cantidad: 400 },
    { id: "publicadas", nombre: "Publicadas", cantidad: 360 },
    { id: "pagadas", nombre: "Pagadas", cantidad: 90 },
  ]

  it("calcula la conversión desde la anterior y desde el inicio", () => {
    const resultado = conversionesEmbudo(etapas)
    expect(resultado[0]).toMatchObject({ delInicio: 1, deLaAnterior: null })
    expect(resultado[1]).toMatchObject({ delInicio: 0.4, deLaAnterior: 0.4 })
    expect(resultado[2].deLaAnterior).toBeCloseTo(0.9)
    expect(resultado[3].delInicio).toBeCloseTo(0.09)
  })

  it("encuentra la transición con la menor conversión", () => {
    expect(mayorCaida(conversionesEmbudo(etapas))?.id).toBe("pagadas")
  })

  it("con base cero no inventa porcentajes", () => {
    const resultado = conversionesEmbudo([
      { id: "a", nombre: "A", cantidad: 0 },
      { id: "b", nombre: "B", cantidad: 0 },
    ])
    expect(resultado[1]).toMatchObject({ delInicio: null, deLaAnterior: null })
    expect(mayorCaida(resultado)).toBeNull()
    expect(conversionesEmbudo([])).toEqual([])
  })
})

describe("completarMatriz", () => {
  it("devuelve siempre las 168 celdas en orden lunes 0 h → domingo 23 h", () => {
    const matriz = completarMatriz([])
    expect(matriz).toHaveLength(168)
    expect(matriz[0]).toEqual({ diaSemana: 1, hora: 0, cantidad: 0 })
    expect(matriz[167]).toEqual({ diaSemana: 7, hora: 23, cantidad: 0 })
  })

  it("suma duplicados, recorta negativos y descarta celdas fuera de rango", () => {
    const matriz = completarMatriz([
      { diaSemana: 3, hora: 14, cantidad: 5 },
      { diaSemana: 3, hora: 14, cantidad: 2 },
      { diaSemana: 2, hora: 9, cantidad: -4 },
      { diaSemana: 0, hora: 9, cantidad: 7 },
      { diaSemana: 8, hora: 9, cantidad: 7 },
      { diaSemana: 1, hora: 24, cantidad: 7 },
      { diaSemana: 1.5, hora: 2, cantidad: 7 },
    ])
    expect(
      matriz.find((c) => c.diaSemana === 3 && c.hora === 14)?.cantidad
    ).toBe(7)
    expect(
      matriz.find((c) => c.diaSemana === 2 && c.hora === 9)?.cantidad
    ).toBe(0)
    expect(matriz.reduce((suma, c) => suma + c.cantidad, 0)).toBe(7)
  })
})

describe("franjaHoraria", () => {
  it("formatea la hora y cruza la medianoche", () => {
    expect(franjaHoraria(9)).toBe("09:00–10:00")
    expect(franjaHoraria(23)).toBe("23:00–00:00")
  })
})
