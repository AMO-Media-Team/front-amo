import { describe, expect, it } from "vitest"

import {
  COLOR_SIN_DATOS,
  PALETAS_SECUENCIALES,
  calcularCortesCuantiles,
  clasificar,
  coloresParaClases,
  crearEscalaCuantiles,
} from "./escalas"

const rango = (desde: number, hasta: number) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)

function luminanciaRelativa(hex: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = canales.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe("calcularCortesCuantiles", () => {
  it("reparte 100 valores en 5 clases de 20", () => {
    const valores = rango(1, 100)
    const cortes = calcularCortesCuantiles(valores)
    expect(cortes).toEqual([21, 41, 61, 81])
    const tamanos = [0, 1, 2, 3, 4].map(
      (clase) => valores.filter((v) => clasificar(v, cortes) === clase).length
    )
    expect(tamanos).toEqual([20, 20, 20, 20, 20])
  })

  it("con pocos valores distintos, cada valor es su propia clase", () => {
    expect(calcularCortesCuantiles([7, 3, 3, 12])).toEqual([7, 12])
    expect(calcularCortesCuantiles([4])).toEqual([])
    expect(calcularCortesCuantiles([])).toEqual([])
  })

  it("funde los cortes repetidos por muchos ceros sin crear clases vacías", () => {
    const valores = [...Array<number>(12).fill(0), 1, 2, 3, 4, 5, 6, 7, 8]
    const cortes = calcularCortesCuantiles(valores)
    expect(cortes).toEqual([1, 5])
    expect(clasificar(0, cortes)).toBe(0)
    expect(new Set(valores.map((v) => clasificar(v, cortes))).size).toBe(
      cortes.length + 1
    )
  })

  it("ignora valores no finitos", () => {
    expect(calcularCortesCuantiles([Number.NaN, 1, Infinity, 2])).toEqual([2])
  })

  it("los cortes son estrictamente crecientes", () => {
    const valores = [5, 5, 5, 8, 8, 9, 20, 20, 20, 20, 21, 50, 50, 99]
    const cortes = calcularCortesCuantiles(valores)
    cortes
      .slice(1)
      .forEach((corte, i) => expect(corte).toBeGreaterThan(cortes[i]))
  })
})

describe("paletas", () => {
  it("tienen 5 pasos HEX y luminancia monótona según el tema", () => {
    const oscuro = PALETAS_SECUENCIALES.oscuro.map(luminanciaRelativa)
    const claro = PALETAS_SECUENCIALES.claro.map(luminanciaRelativa)
    for (const paleta of Object.values(PALETAS_SECUENCIALES)) {
      expect(paleta).toHaveLength(5)
      paleta.forEach((color) => expect(color).toMatch(/^#[0-9A-F]{6}$/))
    }
    oscuro.slice(1).forEach((l, i) => expect(l).toBeGreaterThan(oscuro[i]))
    claro.slice(1).forEach((l, i) => expect(l).toBeLessThan(claro[i]))
  })

  it("reparte los colores a lo largo de toda la rampa", () => {
    expect(coloresParaClases(2, "oscuro")).toEqual([
      PALETAS_SECUENCIALES.oscuro[0],
      PALETAS_SECUENCIALES.oscuro[4],
    ])
    expect(coloresParaClases(5, "claro")).toEqual(PALETAS_SECUENCIALES.claro)
    expect(coloresParaClases(0, "claro")).toEqual([])
  })
})

describe("crearEscalaCuantiles", () => {
  it("separa sin datos del cero", () => {
    const escala = crearEscalaCuantiles([0, 0, 4, 9, 15], { tema: "oscuro" })
    expect(escala.colorPara(null)).toBe(COLOR_SIN_DATOS.oscuro)
    expect(escala.colorPara(undefined)).toBe(COLOR_SIN_DATOS.oscuro)
    expect(escala.colorPara(0)).toBe(escala.colores[0])
    expect(escala.colorPara(0)).not.toBe(COLOR_SIN_DATOS.oscuro)
    expect(escala.colorPara(15)).toBe(escala.colores.at(-1))
  })

  it("genera una leyenda contigua desde el mínimo", () => {
    const escala = crearEscalaCuantiles(rango(1, 100), { tema: "claro" })
    expect(escala.leyenda[0]).toMatchObject({ desde: 1, hasta: 21 })
    expect(escala.leyenda.at(-1)).toMatchObject({ desde: 81, hasta: null })
    expect(escala.leyenda.map((e) => e.color)).toEqual(escala.colores)
  })

  it("sin valores todo es sin datos", () => {
    const escala = crearEscalaCuantiles([], { tema: "claro" })
    expect(escala.leyenda).toEqual([])
    expect(escala.colorPara(3)).toBe(COLOR_SIN_DATOS.claro)
  })
})
