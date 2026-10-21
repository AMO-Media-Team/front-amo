import { describe, expect, it } from "vitest"

import {
  type Nombradores,
  rankingCiudades,
  rankingPaises,
  type UbicacionMuestra,
} from "./rankings"

const NOMBRAR: Nombradores = {
  pais: (iso2) =>
    ({ CO: "Colombia", US: "Estados Unidos", MX: "México" })[iso2] ?? null,
  municipio: (codigo) =>
    codigo === "05001"
      ? { nombre: "Medellín", departamento: "Antioquia" }
      : null,
}

const fila = (
  pais_iso2: string | null,
  ciudad: string | null = null,
  municipio_codigo: string | null = null
): UbicacionMuestra => ({ pais_iso2, ciudad, municipio_codigo })

describe("rankingPaises", () => {
  it("cuenta, ordena y calcula la participación sobre los que tienen país", () => {
    const ranking = rankingPaises(
      [fila("CO"), fila("co"), fila("US"), fila(null), fila("CO")],
      NOMBRAR
    )
    expect(ranking).toEqual([
      {
        clave: "CO",
        etiqueta: "Colombia",
        detalle: "CO",
        iso2: "CO",
        bandera: "🇨🇴",
        cantidad: 3,
        proporcion: 0.75,
      },
      {
        clave: "US",
        etiqueta: "Estados Unidos",
        detalle: "US",
        iso2: "US",
        bandera: "🇺🇸",
        cantidad: 1,
        proporcion: 0.25,
      },
    ])
  })

  it("lo que no cabe se agrupa en «Otros» y las proporciones suman 1", () => {
    const filas = ["CO", "CO", "CO", "US", "US", "MX", "BR", "AR"].map((p) =>
      fila(p)
    )
    const ranking = rankingPaises(filas, NOMBRAR, 3)
    expect(ranking.map((e) => [e.etiqueta, e.cantidad])).toEqual([
      ["Colombia", 3],
      ["Estados Unidos", 2],
      ["Otros", 3],
    ])
    expect(ranking.at(-1)).toMatchObject({
      clave: "__otros__",
      detalle: "3 más",
      iso2: null,
    })
    expect(ranking.reduce((suma, e) => suma + e.proporcion, 0)).toBeCloseTo(1)
  })

  it("sin ubicación, vacío", () => {
    expect(rankingPaises([fila(null)], NOMBRAR)).toEqual([])
  })
})

describe("rankingCiudades", () => {
  it("municipio resuelto (con departamento) o ciudad cruda por país", () => {
    const ranking = rankingCiudades(
      [
        fila("CO", "Medellin", "05001"),
        fila("CO", "MEDELLÍN", "05001"),
        fila("US", "Miami"),
        fila("US", " miami "),
        fila("MX", "Miami"),
        fila("CO", null),
      ],
      NOMBRAR
    )
    expect(
      ranking.map((e) => [e.etiqueta, e.detalle, e.iso2, e.cantidad])
    ).toEqual([
      ["Medellín", "Antioquia", "CO", 2],
      ["Miami", "Estados Unidos", "US", 2],
      ["Miami", "México", "MX", 1],
    ])
    expect(ranking[0].proporcion).toBeCloseTo(2 / 5)
  })
})
