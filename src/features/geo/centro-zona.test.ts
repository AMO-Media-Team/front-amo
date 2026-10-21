import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { FeatureCollection, Geometry, Position } from "geojson"
import { describe, expect, it } from "vitest"

import { centroDelMayorPoligono } from "./centro-zona"

function rectangulo(
  oeste: number,
  sur: number,
  este: number,
  norte: number
): Position[][] {
  return [
    [
      [oeste, sur],
      [este, sur],
      [este, norte],
      [oeste, norte],
      [oeste, sur],
    ],
  ]
}

describe("centroDelMayorPoligono", () => {
  it("devuelve el centro de un polígono simple", () => {
    expect(
      centroDelMayorPoligono({
        type: "Polygon",
        coordinates: rectangulo(-80, 0, -70, 10),
      })
    ).toEqual([-75, 5])
  })

  it("ignora los territorios apartados más pequeños", () => {
    const centro = centroDelMayorPoligono({
      type: "MultiPolygon",
      coordinates: [
        rectangulo(-170, 55, -140, 70), // territorio apartado
        rectangulo(-120, 30, -80, 48), // territorio principal
        rectangulo(-160, 19, -155, 22), // islas
      ],
    })
    expect(centro).toEqual([-100, 39])
  })

  it("no deja que la latitud infle un territorio polar", () => {
    // Mismo tamaño en grados: gana el que está más cerca del ecuador.
    const centro = centroDelMayorPoligono({
      type: "MultiPolygon",
      coordinates: [rectangulo(10, 74, 30, 80), rectangulo(5, 58, 25, 64)],
    })
    expect(centro).toEqual([15, 61])
  })

  it("no tiene centro sin polígonos", () => {
    expect(
      centroDelMayorPoligono({ type: "Point", coordinates: [-74, 4] })
    ).toBeNull()
    expect(
      centroDelMayorPoligono({ type: "MultiPolygon", coordinates: [] })
    ).toBeNull()
  })
})

describe("centroDelMayorPoligono con los países reales", () => {
  const paises = JSON.parse(
    readFileSync(join(process.cwd(), "public/data/geo/paises.json"), "utf8")
  ) as FeatureCollection<Geometry, { codigo: string }>

  const centroDe = (codigo: string) => {
    const pais = paises.features.find((f) => f.properties.codigo === codigo)
    return pais ? centroDelMayorPoligono(pais.geometry) : null
  }

  it.each([
    ["US", [-125, -66], [25, 50]], // contiguos, no Alaska ni Hawái
    ["FR", [-5, 9], [42, 51]], // metropolitana, no Guayana
    ["RU", [27, 180], [41, 78]],
    ["NO", [4, 31], [58, 71]], // continental, no Svalbard
    ["CO", [-79, -67], [-4, 13]],
    ["ES", [-10, 4], [36, 44]],
    ["CL", [-76, -66], [-56, -17]],
  ] as const)("%s cae en su territorio principal", (codigo, lon, lat) => {
    const centro = centroDe(codigo)
    expect(centro).not.toBeNull()
    expect(centro?.[0]).toBeGreaterThan(lon[0])
    expect(centro?.[0]).toBeLessThan(lon[1])
    expect(centro?.[1]).toBeGreaterThan(lat[0])
    expect(centro?.[1]).toBeLessThan(lat[1])
  })

  it("todo país con polígono tiene centro", () => {
    for (const pais of paises.features) {
      expect(
        centroDelMayorPoligono(pais.geometry),
        pais.properties.codigo
      ).not.toBeNull()
    }
  })
})
