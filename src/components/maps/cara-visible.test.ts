import { describe, expect, it } from "vitest"

import {
  ANGULO_A_LA_VISTA,
  distanciaAngular,
  estaALaVista,
} from "./cara-visible"

const COLOMBIA = [-73.6, 4.2] as const
const ESPANA = [-3.7, 40.4] as const
const ARGENTINA = [-64, -34] as const
const INDONESIA = [113.9, -0.8] as const

describe("distanciaAngular", () => {
  it("mide por el círculo máximo, en grados", () => {
    expect(distanciaAngular([0, 0], [0, 0])).toBe(0)
    expect(distanciaAngular([0, 0], [90, 0])).toBeCloseTo(90)
    expect(distanciaAngular([10, 0], [10, 45])).toBeCloseTo(45)
    expect(distanciaAngular([0, 90], [123, -90])).toBeCloseTo(180)
  })

  it("cruza el antimeridiano por el camino corto", () => {
    expect(distanciaAngular([179, 0], [-179, 0])).toBeCloseTo(2)
  })

  it("es simétrica", () => {
    expect(distanciaAngular(COLOMBIA, ESPANA)).toBeCloseTo(
      distanciaAngular(ESPANA, COLOMBIA)
    )
  })
})

describe("estaALaVista", () => {
  it("deja a la vista lo cercano al centro de la cámara", () => {
    expect(estaALaVista(COLOMBIA, COLOMBIA)).toBe(true)
    expect(estaALaVista(COLOMBIA, ARGENTINA)).toBe(true)
  })

  it("da por ocultos el borde del globo y la cara opuesta", () => {
    expect(distanciaAngular(COLOMBIA, ESPANA)).toBeGreaterThan(
      ANGULO_A_LA_VISTA
    )
    expect(estaALaVista(COLOMBIA, ESPANA)).toBe(false)
    expect(estaALaVista(COLOMBIA, INDONESIA)).toBe(false)
  })

  it("tras medio giro, lo que estaba al frente queda oculto", () => {
    expect(estaALaVista([106.4, 4.2], COLOMBIA)).toBe(false)
  })
})
