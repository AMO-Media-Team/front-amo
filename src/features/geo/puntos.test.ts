import { describe, expect, it } from "vitest"

import {
  agregarEnCuadricula,
  filasLeidas,
  paginasEstratificadas,
} from "./puntos"

describe("páginas de lectura para el mapa de calor", () => {
  it("si caben, se leen todas las filas en páginas contiguas", () => {
    expect(paginasEstratificadas(2500, 12_000, 1000)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
    ])
    expect(paginasEstratificadas(0)).toEqual([])
  })

  it("con más filas que el tope, reparte las páginas a lo largo del total", () => {
    const paginas = paginasEstratificadas(30_000, 3000, 1000)
    expect(paginas).toEqual([
      [0, 999],
      [10_000, 10_999],
      [20_000, 20_999],
    ])
    expect(filasLeidas(paginas)).toBe(3000)
  })

  it("nunca pide filas más allá del total", () => {
    const paginas = paginasEstratificadas(12_345, 12_000, 1000)
    expect(paginas.at(-1)?.[1]).toBeLessThan(12_345)
    expect(filasLeidas(paginas)).toBe(12_000)
  })
})

describe("agregación en cuadrícula", () => {
  it("funde las coordenadas de una misma celda y suma su peso", () => {
    const puntos = agregarEnCuadricula(
      [
        { lon: -74.081, lat: 4.611 },
        { lon: -74.079, lat: 4.609 },
        { lon: -75.57, lat: 6.25 },
      ],
      0.01
    )
    expect(puntos).toEqual([
      [-74.08, 4.61, 2],
      [-75.57, 6.25, 1],
    ])
  })

  it("aplica el factor de la muestra y redondea a la celda sin ruido binario", () => {
    const [punto] = agregarEnCuadricula(
      [{ lon: 0.349, lat: -0.351 }],
      0.05,
      2.5
    )
    expect(punto).toEqual([0.35, -0.35, 2.5])
  })

  it("descarta coordenadas imposibles", () => {
    expect(
      agregarEnCuadricula(
        [
          { lon: 200, lat: 4 },
          { lon: -74, lat: Number.NaN },
        ],
        0.25
      )
    ).toEqual([])
  })
})
