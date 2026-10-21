import { describe, expect, it } from "vitest"

import {
  construirIsotipo,
  geometriaA,
  ISOTIPO_COMPACTO,
  ISOTIPO_PRINCIPAL,
  radiosArcos,
  semianguloPunta,
  tangenciaDerecha,
  type ParametrosIsotipo,
} from "./isotipo"
import { cajaDe, poligonos, type Punto } from "./trazado"

const distancia = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Área con signo (y hacia abajo): positiva en sentido horario de pantalla. */
function areaConSigno(poligono: readonly Punto[]): number {
  return (
    poligono.reduce((suma, [x0, y0], i) => {
      const [x1, y1] = poligono[(i + 1) % poligono.length]
      return suma + (x0 * y1 - x1 * y0)
    }, 0) / 2
  )
}

/** Distancia (con signo, positiva hacia dentro) de un punto al flanco derecho. */
function distanciaAlFlanco(p: ParametrosIsotipo, [x, y]: Punto): number {
  const theta = semianguloPunta(p)
  return p.radio - x * Math.cos(theta) - y * Math.sin(theta)
}

describe("pin", () => {
  it("los flancos son tangentes a la cabeza", () => {
    const p = ISOTIPO_PRINCIPAL
    const tangente = tangenciaDerecha(p)
    expect(distancia(tangente, [0, 0])).toBeCloseTo(p.radio, 6)
    // Radio y flanco perpendiculares en el punto de tangencia.
    const flanco = [0 - tangente[0], p.distanciaPunta - tangente[1]]
    expect(tangente[0] * flanco[0] + tangente[1] * flanco[1]).toBeCloseTo(0, 6)
  })

  it("rechaza una punta dentro de la cabeza", () => {
    expect(() =>
      semianguloPunta({ ...ISOTIPO_PRINCIPAL, distanciaPunta: 10 })
    ).toThrow()
  })
})

describe.each<[string, ParametrosIsotipo]>([
  ["principal", ISOTIPO_PRINCIPAL],
  ["compacto", ISOTIPO_COMPACTO],
])("isotipo %s", (_, p) => {
  const piezas = construirIsotipo(p)
  const a = geometriaA(p)

  it("es un pin de una pieza con la Λ calada y los arcos pedidos", () => {
    const [silueta, contraforma, ...resto] = poligonos(piezas.pin)
    expect(resto).toHaveLength(0)
    // Giro contrario: con la regla nonzero la Λ queda hueca.
    expect(areaConSigno(silueta)).toBeGreaterThan(0)
    expect(areaConSigno(contraforma)).toBeLessThan(0)
    expect(piezas.arcos).toHaveLength(p.arcos)
  })

  it("inscribe la Λ con el mismo margen en la cabeza y en los flancos", () => {
    const margenSuperior = a.verticeExterior[1] + p.radio
    const margenFlanco = distanciaAlFlanco(p, a.pieDerecho) - p.trazoA / 2
    expect(margenSuperior).toBeCloseTo(p.margenA, 6)
    expect(margenFlanco).toBeCloseTo(p.margenA, 6)
  })

  it("deja al menos el margen entre la contraforma y el borde del pin", () => {
    const [, contraforma] = poligonos(piezas.pin)
    const yTangencia = tangenciaDerecha(p)[1]
    const tolerancia = 1e-6
    for (const [x, y] of contraforma) {
      // Sobre la línea de tangencia el borde es la cabeza; debajo, los flancos.
      const holgura =
        y <= yTangencia
          ? p.radio - distancia([x, y], [0, 0])
          : distanciaAlFlanco(p, [Math.abs(x), y])
      expect(holgura).toBeGreaterThan(p.margenA - tolerancia)
    }
  })

  it("los arcos siguen el ritmo del módulo: hueco, arco, hueco, arco", () => {
    radiosArcos(p).forEach((interior, i) => {
      expect(interior).toBeCloseTo(
        p.radio + p.hueco + i * (p.hueco + p.grosorArco),
        6
      )
    })
    const [primero] = piezas.arcos
    const inicio = primero[0]
    if (inicio.tipo !== "M") throw new Error("El arco debe empezar con M")
    expect(distancia(inicio.p, [0, 0])).toBeCloseTo(
      p.radio + p.hueco + p.grosorArco,
      6
    )
  })

  it("la caja envuelve pin y arcos", () => {
    const caja = cajaDe(piezas.contornoPin, ...piezas.arcos)
    expect(piezas.caja).toEqual(caja)
    expect(piezas.caja.alto).toBeGreaterThan(p.radio + p.distanciaPunta - 1)
  })
})

describe("geometriaA", () => {
  it("rechaza un margen que no deja sitio a la Λ", () => {
    expect(() => geometriaA({ ...ISOTIPO_PRINCIPAL, margenA: 19 })).toThrow()
  })
})
