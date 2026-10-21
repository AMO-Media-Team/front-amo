import { describe, expect, it } from "vitest"

import { listarDepartamentos } from "@/lib/geo/catalogo"

import {
  arcoEntre,
  calcularDatosIlustracion,
  CONEXIONES,
} from "./geometria-ilustracion"

function puntoDeControl(path: string): [number, number] {
  const [, cx, cy] = /Q(-?[\d.]+),(-?[\d.]+)/.exec(path) ?? []
  return [Number(cx), Number(cy)]
}

describe("arcoEntre", () => {
  it("une los extremos con una curva cuadrática", () => {
    expect(arcoEntre([0, 100], [100, 100])).toMatch(/^M0,100Q[\d.,-]+ 100,100$/)
  })

  it("se arquea hacia arriba sin importar el sentido", () => {
    const [, haciaDerecha] = puntoDeControl(arcoEntre([0, 100], [100, 100]))
    const [, haciaIzquierda] = puntoDeControl(arcoEntre([100, 100], [0, 100]))
    expect(haciaDerecha).toBeLessThan(100)
    expect(haciaIzquierda).toBeLessThan(100)
  })

  it("la flecha es proporcional a la distancia", () => {
    const [, cy] = puntoDeControl(arcoEntre([0, 0], [200, 0], 0.25))
    expect(cy).toBeCloseTo(-50)
  })

  it("tolera puntos coincidentes", () => {
    expect(arcoEntre([5, 5], [5, 5])).toBe("M5,5")
  })
})

describe("calcularDatosIlustracion", () => {
  const datos = calcularDatosIlustracion()
  const total = listarDepartamentos().length

  it("dibuja todos los departamentos y sus capitales", () => {
    expect(datos.departamentos).toHaveLength(total)
    expect(datos.capitales).toHaveLength(total)
  })

  it("ordena el dibujo de norte a sur sin repetir posiciones", () => {
    const ordenes = datos.departamentos.map((d) => d.orden)
    expect(new Set(ordenes).size).toBe(total)
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b))
    expect(datos.departamentos[0].codigo).toBe("88")
  })

  it("todas las conexiones resuelven sus dos capitales", () => {
    expect(datos.arcos).toHaveLength(CONEXIONES.length)
  })

  it("los puntos caen dentro del lienzo 1000 × 1370", () => {
    const puntos = [...datos.medios, ...datos.capitales.map((c) => c.punto)]
    expect(datos.medios.length).toBeGreaterThan(100)
    for (const [x, y] of puntos) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1000)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1370)
    }
  })
})
