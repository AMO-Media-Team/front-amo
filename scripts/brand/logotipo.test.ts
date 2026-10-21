import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  cargarFuente,
  condensador,
  construirPalabra,
  evaluarCuadratica,
  recortarCuadratica,
} from "./logotipo"
import { cajaDe } from "./trazado"

describe("condensador", () => {
  const astas = [
    [0, 10],
    [30, 40],
    [60, 70],
  ] as const
  const f = condensador(astas, 5)

  it("conserva el grosor de las astas", () => {
    expect(f(10) - f(0)).toBe(10)
    expect(f(40) - f(30)).toBe(10)
    expect(f(70) - f(60)).toBe(10)
  })

  it("estrecha cada contraforma en la reducción pedida", () => {
    expect(f(30) - f(10)).toBeCloseTo(15)
    expect(f(60) - f(40)).toBeCloseTo(15)
  })

  it("es monótono", () => {
    const muestras = Array.from({ length: 80 }, (_, i) => f(i))
    muestras.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(muestras[i]))
  })
})

describe("cuadráticas", () => {
  const curva = [
    [0, 0],
    [5, 10],
    [10, 0],
  ] as const

  it("recortar en t=1 devuelve la misma curva", () => {
    expect(recortarCuadratica(curva, 1)).toEqual(curva)
  })

  it("la subcurva termina en el punto evaluado", () => {
    const [, , fin] = recortarCuadratica(curva, 0.3)
    expect(fin).toEqual(evaluarCuadratica(curva, 0.3))
  })
})

describe("construirPalabra", () => {
  const fuente = cargarFuente(
    join(__dirname, "fuentes", "PlusJakartaSans-ExtraBold.ttf")
  )
  const palabra = construirPalabra(fuente)

  it("asienta la palabra en la línea base con la x-height de la fuente", () => {
    const caja = cajaDe(palabra.trazado)
    expect(palabra.alturaX).toBe(546)
    expect(caja.x).toBeCloseTo(0, 1)
    // Sobrepasos de la "o" y la "a" (±12) alrededor de la x-height.
    expect(caja.y + caja.alto).toBeCloseTo(12, 0)
    expect(caja.ancho).toBeCloseTo(palabra.ancho, 0)
  })
})
