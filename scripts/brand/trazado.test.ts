import { describe, expect, it } from "vitest"

import {
  cajaDe,
  centroArco,
  centroide,
  formatearNumero,
  redondear,
  serializar,
  transformar,
  type Trazado,
} from "./trazado"

const cuadrado: Trazado = [
  { tipo: "M", p: [0, 0] },
  { tipo: "L", p: [10, 0] },
  { tipo: "L", p: [10, 10] },
  { tipo: "L", p: [0, 10] },
  { tipo: "Z" },
]

describe("formatearNumero", () => {
  it("redondea a dos decimales y compacta ceros", () => {
    expect(formatearNumero(1.23456)).toBe("1.23")
    expect(formatearNumero(0.5)).toBe(".5")
    expect(formatearNumero(-0.25)).toBe("-.25")
    expect(formatearNumero(3)).toBe("3")
  })

  it("no emite -0", () => {
    expect(redondear(-0.001)).toBe(0)
    expect(formatearNumero(-0.001)).toBe("0")
  })
})

describe("serializar", () => {
  it("usa comandos relativos tras el primer M", () => {
    expect(serializar(cuadrado)).toBe("M0 0l10 0l0 10l-10 0z")
  })

  it("no acumula error de redondeo en trazados largos", () => {
    const pasos: Trazado = [
      { tipo: "M", p: [0, 0] },
      ...Array.from({ length: 100 }, (_, i) => ({
        tipo: "L" as const,
        p: [(i + 1) * 0.333, 0] as const,
      })),
    ]
    const deltas = serializar(pasos)
      .slice(3)
      .split("l")
      .filter(Boolean)
      .map((tramo) => Number(tramo.split(" ")[0]))
    const final = deltas.reduce((suma, d) => suma + d, 0)
    expect(final).toBeCloseTo(33.3, 2)
  })

  it("separa números negativos sin espacio", () => {
    const trazado: Trazado = [
      { tipo: "M", p: [5, 5] },
      { tipo: "L", p: [2, 1] },
    ]
    expect(serializar(trazado)).toBe("M5 5l-3-4")
  })
})

describe("transformar", () => {
  it("escala radios de arco y traslada puntos", () => {
    const arco: Trazado = [
      { tipo: "M", p: [0, 0] },
      { tipo: "A", radio: 5, arcoGrande: false, horario: true, p: [10, 0] },
    ]
    const [m, a] = transformar(arco, { escala: 2, dx: 1, dy: 1 })
    expect(m).toEqual({ tipo: "M", p: [1, 1] })
    expect(a).toMatchObject({ radio: 10, p: [21, 1] })
  })
})

describe("geometría de cajas y centroides", () => {
  it("calcula la caja de un polígono", () => {
    expect(cajaDe(cuadrado)).toEqual({ x: 0, y: 0, ancho: 10, alto: 10 })
  })

  it("incluye la panza de los arcos en la caja", () => {
    const semicirculo: Trazado = [
      { tipo: "M", p: [-10, 0] },
      { tipo: "A", radio: 10, arcoGrande: false, horario: true, p: [10, 0] },
      { tipo: "Z" },
    ]
    const caja = cajaDe(semicirculo)
    expect(caja.y).toBeCloseTo(-10, 1)
    expect(caja.alto).toBeCloseTo(10, 1)
  })

  it("ubica el centro de un arco según sus banderas", () => {
    const centro = centroArco([-10, 0], [10, 0], 10, false, true)
    expect(centro[0]).toBeCloseTo(0)
    expect(centro[1]).toBeCloseTo(0)
  })

  it("devuelve el centroide de área", () => {
    const [cx, cy] = centroide(cuadrado)
    expect(cx).toBeCloseTo(5)
    expect(cy).toBeCloseTo(5)
  })
})
