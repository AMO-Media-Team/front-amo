import { describe, expect, it } from "vitest"

import {
  acercarVelocidad,
  GIRO,
  girarLongitud,
  tiempoDeCuadro,
  velocidadCrucero,
} from "./giro-globo"

const PLENA = 360 / GIRO.periodoS

describe("tiempoDeCuadro", () => {
  it("usa el tiempo real de un cuadro normal o lento", () => {
    expect(tiempoDeCuadro(16.7)).toBeCloseTo(16.7)
    expect(tiempoDeCuadro(200)).toBe(200)
  })

  it("no salta al volver de una pausa larga ni retrocede", () => {
    expect(tiempoDeCuadro(45_000)).toBe(GIRO.cuadroMaximoMs)
    expect(tiempoDeCuadro(-3)).toBe(0)
  })
})

describe("velocidadCrucero", () => {
  it("gira a velocidad plena con el globo completo a la vista", () => {
    expect(velocidadCrucero(0.8)).toBeCloseTo(PLENA)
    expect(velocidadCrucero(GIRO.zoomPleno)).toBeCloseTo(PLENA)
  })

  it("se desvanece al acercar y se detiene de cerca", () => {
    const medio = (GIRO.zoomPleno + GIRO.zoomNulo) / 2
    expect(velocidadCrucero(medio)).toBeCloseTo(PLENA / 2)
    expect(velocidadCrucero(GIRO.zoomNulo)).toBe(0)
    expect(velocidadCrucero(9)).toBe(0)
  })
})

describe("acercarVelocidad", () => {
  it("arranca de forma gradual y llega a la velocidad objetivo", () => {
    const trasUnCuadro = acercarVelocidad(0, PLENA, 16)
    expect(trasUnCuadro).toBeGreaterThan(0)
    expect(trasUnCuadro).toBeLessThan(PLENA * 0.05)

    let velocidad = 0
    for (let ms = 0; ms < 12_000; ms += 16) {
      velocidad = acercarVelocidad(velocidad, PLENA, 16)
    }
    expect(velocidad).toBe(PLENA)
  })

  it("frena más rápido de lo que arranca y termina en cero exacto", () => {
    const frenando = PLENA - acercarVelocidad(PLENA, 0, 200)
    const arrancando = acercarVelocidad(0, PLENA, 200)
    expect(frenando).toBeGreaterThan(arrancando)

    let velocidad = PLENA
    for (let ms = 0; ms < 3_000; ms += 16) {
      velocidad = acercarVelocidad(velocidad, 0, 16)
    }
    expect(velocidad).toBe(0)
  })

  it("no depende de la tasa de cuadros", () => {
    let a60 = 0
    for (let i = 0; i < 60; i += 1)
      a60 = acercarVelocidad(a60, PLENA, 1000 / 60)
    let a30 = 0
    for (let i = 0; i < 30; i += 1)
      a30 = acercarVelocidad(a30, PLENA, 1000 / 30)
    expect(a60).toBeCloseTo(a30, 6)
  })

  it("ignora un cuadro sin tiempo transcurrido", () => {
    expect(acercarVelocidad(1.2, PLENA, 0)).toBe(1.2)
  })
})

describe("girarLongitud", () => {
  it("corre el centro hacia el oeste: el planeta gira hacia el este", () => {
    expect(girarLongitud(-74, PLENA, 1000)).toBeCloseTo(-74 - PLENA)
  })

  it("da la vuelta por el antimeridiano sin salirse de [-180, 180)", () => {
    expect(girarLongitud(-179.5, 2, 1000)).toBeCloseTo(178.5)
    expect(girarLongitud(180, 0, 16)).toBe(-180)
    const tras = girarLongitud(-74, PLENA, GIRO.periodoS * 1000)
    expect(tras).toBeCloseTo(-74)
  })

  it("no se mueve con velocidad cero", () => {
    expect(girarLongitud(12.5, 0, 1000)).toBeCloseTo(12.5)
  })
})
