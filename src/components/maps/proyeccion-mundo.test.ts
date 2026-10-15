import type { FeatureCollection, Geometry } from "geojson"
import { describe, expect, it } from "vitest"

import {
  ALTO_MUNDO,
  ANCHO_MUNDO,
  equalEarth,
  proyectarEnMundo,
  trazarPaises,
} from "./proyeccion-mundo"

describe("proyección Equal Earth", () => {
  it("coincide con los valores de referencia de la publicación", () => {
    const [x, y] = equalEarth([180, 0])
    expect(x).toBeCloseTo(2.7064, 3)
    expect(y).toBe(0)
    expect(equalEarth([0, 90])[1]).toBeCloseTo(1.3173, 3)
  })

  it("el lienzo cubre el mundo sin la Antártida, con el norte arriba", () => {
    expect(ALTO_MUNDO).toBeGreaterThan(400)
    expect(ALTO_MUNDO).toBeLessThan(ANCHO_MUNDO / 2)
    const [xBogota, yBogota] = proyectarEnMundo([-74.08, 4.61])
    const [xMadrid, yMadrid] = proyectarEnMundo([-3.7, 40.42])
    expect(xBogota).toBeLessThan(xMadrid)
    expect(yBogota).toBeGreaterThan(yMadrid)
    for (const valor of [xBogota, yBogota, xMadrid, yMadrid]) {
      expect(valor).toBeGreaterThan(0)
    }
    expect(yBogota).toBeLessThan(ALTO_MUNDO)
  })
})

describe("trazos de países", () => {
  const coleccion: FeatureCollection<
    Geometry,
    { codigo: string; nombre: string }
  > = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { codigo: "CO", nombre: "Colombia" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-79, -4],
              [-67, -4],
              [-67, 12],
              [-79, 12],
              [-79, -4],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { codigo: "AQ", nombre: "Antártida" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, -80],
              [10, -80],
              [10, -70],
              [0, -80],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { codigo: "ZZ", nombre: "Punto" },
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ],
  }

  it("dibuja polígonos cerrados y omite la Antártida y geometrías sin área", () => {
    const trazos = trazarPaises(coleccion)
    expect(trazos.map((t) => t.codigo)).toEqual(["CO"])
    expect(trazos[0].trazo).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+Z$/)
  })

  it("calcula una sola vez por colección", () => {
    expect(trazarPaises(coleccion)).toBe(trazarPaises(coleccion))
  })
})
