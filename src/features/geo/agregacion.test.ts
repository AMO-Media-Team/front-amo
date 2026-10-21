import { describe, expect, it } from "vitest"

import {
  agruparPorGeometria,
  construirRanking,
  tasaPonderada,
} from "./agregacion"
import type { FilaMetricaGeo } from "./tipos"

function fila(
  codigo: string,
  valor: number | null,
  extra: Partial<FilaMetricaGeo> = {}
): FilaMetricaGeo {
  return {
    codigo,
    codigoGeometria: codigo,
    nombre: `Zona ${codigo}`,
    valor,
    n: null,
    poblacion: null,
    valorPor100k: null,
    ...extra,
  }
}

const CONTEOS = { aditiva: true, por100k: false }
const TASAS = { aditiva: false, por100k: false }

describe("agregación por polígono", () => {
  it("la tasa ponderada es cociente de sumas, no promedio de razones", () => {
    expect(
      tasaPonderada([
        { valor: 1, n: 10 },
        { valor: 0.5, n: 30 },
        { valor: null, n: 50 },
        { valor: 0.9, n: 0 },
      ])
    ).toBeCloseTo((10 + 15) / 40)
    expect(tasaPonderada([{ valor: null, n: 5 }])).toBeNull()
  })

  it("funde municipios que comparten polígono (Norosí se dibuja con Río Viejo)", () => {
    const zonas = agruparPorGeometria(
      [
        fila("13600", 4, { nombre: "Río Viejo" }),
        fila("13490", 2, { nombre: "Norosí", codigoGeometria: "13600" }),
        fila("13001", 9),
      ],
      CONTEOS
    )
    expect(zonas).toHaveLength(2)
    expect(zonas[0]).toMatchObject({
      codigo: "13600",
      nombre: "Río Viejo y Norosí",
      codigos: ["13600", "13490"],
      valor: 6,
    })
  })

  it("en tasas pondera por n al fundir", () => {
    const [zona] = agruparPorGeometria(
      [
        fila("A", 0.8, { n: 30 }),
        fila("B", 0.5, { n: 10, codigoGeometria: "A" }),
      ],
      TASAS
    )
    expect(zona.valor).toBeCloseTo((24 + 5) / 40)
    expect(zona.n).toBe(40)
  })

  it("por 100 mil habitantes usa la tasa de la BD o la recalcula con la población", () => {
    const [directa, calculada] = agruparPorGeometria(
      [
        fila("05", 120, { poblacion: 6_000_000, valorPor100k: 2 }),
        fila("08", 50, { poblacion: 2_500_000 }),
      ],
      { aditiva: true, por100k: true }
    )
    expect(directa.valor).toBe(2)
    expect(directa.valorBase).toBe(120)
    expect(calculada.valor).toBeCloseTo(2)
  })

  it("el cero es un dato; la ausencia (null) no", () => {
    const [cero, nulo] = agruparPorGeometria(
      [fila("A", 0), fila("B", null)],
      CONTEOS
    )
    expect(cero.valor).toBe(0)
    expect(nulo.valor).toBeNull()
  })
})

describe("ranking", () => {
  it("ordena de mayor a menor, comparte puesto en empates y deja sin dato al final", () => {
    const ranking = construirRanking(
      agruparPorGeometria(
        [
          fila("A", 5),
          fila("B", null),
          fila("C", 9),
          fila("D", 5),
          fila("E", 1),
        ],
        CONTEOS
      ),
      CONTEOS
    )
    expect(ranking.filas.map((f) => [f.codigo, f.posicion])).toEqual([
      ["C", 1],
      ["A", 2],
      ["D", 2],
      ["E", 4],
      ["B", null],
    ])
    expect(ranking.total).toBe(20)
    expect(ranking.conDatos).toBe(4)
    expect(ranking.maximo).toBe(9)
    expect(ranking.filas[0].participacion).toBeCloseTo(9 / 20)
  })

  it("en tasas no hay participación y el total es el promedio ponderado", () => {
    const ranking = construirRanking(
      agruparPorGeometria(
        [fila("A", 0.9, { n: 20 }), fila("B", 0.6, { n: 60 })],
        TASAS
      ),
      TASAS
    )
    expect(ranking.filas[0].participacion).toBeNull()
    expect(ranking.total).toBeCloseTo((18 + 36) / 80)
  })
})
