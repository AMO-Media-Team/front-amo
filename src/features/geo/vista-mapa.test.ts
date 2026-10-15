import { describe, expect, it } from "vitest"

import { COLOR_SIN_DATOS, PALETAS_SECUENCIALES } from "@/lib/geo/escalas"

import type { FilaMetricaGeo } from "./tipos"
import {
  circulosDeVista,
  codigosDeClase,
  construirVistaMapa,
  RADIO_ZONA_DIMINUTA,
} from "./vista-mapa"

function fila(codigo: string, valor: number | null): FilaMetricaGeo {
  return {
    codigo,
    codigoGeometria: codigo,
    nombre: `Zona ${codigo}`,
    valor,
    n: null,
    poblacion: null,
    valorPor100k: null,
  }
}

const UNIVERSO = ["A", "B", "C", "D", "E", "F", "G"].map((codigo) => ({
  codigo,
  nombre: `Polígono ${codigo}`,
}))

function vista(filas: FilaMetricaGeo[], incluirSinDatos = true) {
  return construirVistaMapa({
    filas,
    universo: UNIVERSO,
    incluirSinDatos,
    aditiva: true,
    por100k: false,
    tema: "oscuro",
  })
}

describe("vista del mapa", () => {
  const filas = [
    fila("A", 1),
    fila("B", 2),
    fila("C", 3),
    fila("D", 4),
    fila("E", 50),
    fila("F", null),
  ]

  it("completa el ranking con los polígonos sin fila y los cuenta como sin datos", () => {
    const resultado = vista(filas)
    expect(resultado.ranking.filas).toHaveLength(7)
    expect(resultado.sinDatos).toBe(2)
    expect(resultado.porCodigo.get("G")?.nombre).toBe("Polígono G")
  })

  it("en el mapa mundial no lista los países sin registros", () => {
    const resultado = vista(filas, false)
    expect(resultado.ranking.filas).toHaveLength(6)
    expect(resultado.sinDatos).toBe(1)
  })

  it("colorea por cuantiles solo las zonas con dato, con clases coherentes con la leyenda", () => {
    const resultado = vista(filas)
    expect(resultado.colores.has("F")).toBe(false)
    expect(resultado.colores.has("G")).toBe(false)
    expect(resultado.colores.get("A")).toBe(PALETAS_SECUENCIALES.oscuro[0])
    expect(resultado.colores.get("E")).toBe(PALETAS_SECUENCIALES.oscuro[4])
    expect(resultado.conteos.reduce((a, b) => a + b, 0)).toBe(5)
    for (const [codigo, clase] of resultado.claseDe) {
      expect(resultado.colores.get(codigo)).toBe(
        resultado.escala.colores[clase]
      )
    }
    expect(resultado.escala.colorSinDatos).toBe(COLOR_SIN_DATOS.oscuro)
    expect([...codigosDeClase(resultado, 4)]).toEqual(["E"])
  })

  it("una métrica aditiva con todo en cero se presenta sin datos: sin colores ni puestos", () => {
    const resultado = vista(UNIVERSO.map(({ codigo }) => fila(codigo, 0)))
    expect(resultado.sinActividad).toBe(true)
    expect(resultado.ranking.conDatos).toBe(0)
    expect(resultado.ranking.total).toBe(0)
    expect(resultado.colores.size).toBe(0)
    expect(resultado.conteos).toEqual([])
    expect(resultado.ranking.filas.every((f) => f.posicion === null)).toBe(true)
    expect(resultado.ranking.filas.every((f) => f.participacion === null)).toBe(
      true
    )
    // Los ceros se conservan: el detalle muestra "0", no "Sin datos".
    expect(resultado.porCodigo.get("A")?.valor).toBe(0)
  })

  it("con alguna zona activa, los ceros son datos y entran en la escala", () => {
    const resultado = vista([fila("A", 0), fila("B", 0), fila("C", 4)])
    expect(resultado.sinActividad).toBe(false)
    expect(resultado.ranking.conDatos).toBe(3)
    expect(resultado.colores.has("A")).toBe(true)
  })

  it("una tasa en cero sí es un dato (0 % de cumplimiento)", () => {
    const resultado = construirVistaMapa({
      filas: [
        { ...fila("A", 0), n: 25 },
        { ...fila("B", 0), n: 40 },
      ],
      universo: UNIVERSO,
      incluirSinDatos: false,
      aditiva: false,
      por100k: false,
      tema: "claro",
    })
    expect(resultado.sinActividad).toBe(false)
    expect(resultado.ranking.conDatos).toBe(2)
  })

  it("dibuja círculos proporcionales para zonas sin polígono y fijos para las diminutas", () => {
    const resultado = vista(
      [fila("A", 100), fila("AW", 25), fila("88", 3)],
      false
    )
    const { circulos, radios } = circulosDeVista(
      resultado,
      [
        { codigo: "AW", centro: [-70, 12.5] },
        { codigo: "XX", centro: [0, 0] },
      ],
      [{ codigo: "88", centro: [-81.7, 12.5] }]
    )
    expect(circulos.map((c) => c.codigo)).toEqual(["AW", "88"])
    // Área proporcional: la mitad de la raíz del máximo.
    expect(radios.get("AW")).toBeCloseTo(4 + 18 * Math.sqrt(0.25))
    expect(radios.get("88")).toBe(RADIO_ZONA_DIMINUTA)
  })
})
