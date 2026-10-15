import { describe, expect, it } from "vitest"

import {
  BBOX_COLOMBIA,
  CENTRO_COLOMBIA,
  claveAmbito,
  encuadreDelNivel,
  urlGeometria,
  zoomGlobo,
} from "./encuadre"
import { centrosSinPoligono } from "./sin-poligono"

describe("encuadre y capas por nivel", () => {
  it("la envolvente de Colombia incluye el archipiélago de San Andrés", () => {
    const [oeste, sur, este, norte] = BBOX_COLOMBIA
    expect(oeste).toBeLessThan(-81.5)
    expect(sur).toBeLessThan(-4)
    expect(este).toBeGreaterThan(-67.5)
    expect(norte).toBeGreaterThan(13)
  })

  it("el globo siempre mira a Colombia, con zoom según el ancho", () => {
    const encuadre = encuadreDelNivel(
      { nivel: "internacional", departamento: null },
      800
    )
    expect(encuadre).toEqual({
      tipo: "centro",
      centro: CENTRO_COLOMBIA,
      zoom: zoomGlobo(800),
    })
    expect(zoomGlobo(320)).toBeLessThan(zoomGlobo(1200))
    expect(zoomGlobo(0)).toBeGreaterThan(0)
    expect(zoomGlobo(10_000)).toBeLessThanOrEqual(2)
  })

  it("nacional encuadra Colombia y departamental el bbox precalculado", () => {
    expect(
      encuadreDelNivel({ nivel: "nacional", departamento: null }, 900)
    ).toEqual({ tipo: "limites", bbox: BBOX_COLOMBIA })
    const antioquia = encuadreDelNivel(
      { nivel: "departamental", departamento: "05" },
      900
    )
    expect(antioquia.tipo).toBe("limites")
    if (antioquia.tipo === "limites") {
      expect(antioquia.bbox[0]).toBeGreaterThan(BBOX_COLOMBIA[0])
    }
  })

  it("cada nivel carga su GeoJSON optimizado y tiene una clave de ámbito propia", () => {
    expect(urlGeometria({ nivel: "internacional", departamento: null })).toBe(
      "/data/geo/paises.json"
    )
    expect(urlGeometria({ nivel: "departamental", departamento: "05" })).toBe(
      "/data/geo/municipios/05.json"
    )
    expect(
      claveAmbito({ nivel: "departamental", departamento: "05" })
    ).not.toBe(claveAmbito({ nivel: "departamental", departamento: "08" }))
  })

  it("solo los países sin polígono (y una vez) van como círculos", () => {
    const fila = (codigo: string) => ({
      codigo,
      codigoGeometria: codigo,
      nombre: codigo,
      valor: 1,
      n: null,
      poblacion: null,
      valorPor100k: null,
    })
    expect(
      centrosSinPoligono("internacional", [
        fila("AW"),
        fila("AW"),
        fila("CO"),
      ]).map((c) => c.codigo)
    ).toEqual(["AW"])
    expect(centrosSinPoligono("nacional", [fila("AW")])).toEqual([])
  })
})
