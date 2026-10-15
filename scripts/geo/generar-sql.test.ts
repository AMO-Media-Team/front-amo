import { describe, expect, it } from "vitest"

import type { Departamento, Municipio, Pais } from "../../src/lib/geo/tipos"
import { generarSqlGeo } from "./generar-sql"

const pais: Pais = {
  iso2: "CI",
  iso3: "CIV",
  numerico: "384",
  nombre: "Costa de Marfil",
  nombreNormalizado: "costa de marfil",
  alias: ["cote divoire", "ivory coast"],
  continente: "África",
  subregion: "África occidental",
  conGeometria: true,
  centroide: [-5.5, 7.6],
}

const departamento: Departamento = {
  codigo: "11",
  nombre: "Bogotá, D.C.",
  nombreCorto: "Bogotá",
  nombreNormalizado: "bogota",
  alias: [],
  iso31662: "CO-DC",
  region: "Andina",
  capitalCodigo: "11001",
  poblacion: 7942867,
  centroide: [-74.1174, 4.5631],
  bbox: [-74.5135, 3.6517, -74.0067, 4.8133],
}

const municipio: Municipio = {
  codigo: "05001",
  departamentoCodigo: "05",
  nombre: "Medellín",
  nombreNormalizado: "medellin",
  tipo: "MUNICIPIO",
  esCapital: true,
  centroide: [-75.581775, 6.246631],
  codigoGeometria: "05001",
  bbox: [-75.7567, 6.1683, -75.4718, 6.3784],
}

describe("generarSqlGeo", () => {
  const kosovo: Pais = {
    ...pais,
    iso2: "XK",
    iso3: "XKX",
    numerico: null,
    nombre: "Kosovo",
    nombreNormalizado: "kosovo",
    alias: [],
    continente: "Europa",
    subregion: null,
    centroide: [20.9, 42.6],
  }
  const sql = generarSqlGeo({
    paises: [{ ...pais, nombre: "Côte d'Ivoire" }, kosovo],
    departamentos: [departamento],
    municipios: [municipio],
  })

  it("es idempotente y transaccional", () => {
    expect(sql).toMatch(/^-- Generado/)
    expect(sql).toContain("begin;")
    expect(sql.trimEnd()).toMatch(/commit;$/)
    expect(sql).toContain("on conflict (iso2) do update set")
    expect(sql.match(/on conflict \(codigo\) do update set/g)).toHaveLength(2)
  })

  it("inserta en orden: países, departamentos y municipios", () => {
    const posiciones = [
      "public.paises",
      "public.departamentos",
      "public.municipios",
    ].map((tabla) => sql.indexOf(`insert into ${tabla}`))
    expect(posiciones.every((p) => p >= 0)).toBe(true)
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
  })

  it("escapa comillas y serializa arreglos, nulos y booleanos", () => {
    expect(sql).toContain("'Côte d''Ivoire'")
    expect(sql).toContain("array['cote divoire', 'ivory coast']::text[]")
    expect(sql).toContain("'{}'")
    expect(sql).toContain(
      "('XK', 'XKX', null, 'Kosovo', 'kosovo', '{}', 'Europa', null, true, 20.9, 42.6)"
    )
    expect(sql).toContain(
      "array[-74.5135, 3.6517, -74.0067, 4.8133]::numeric[]"
    )
    expect(sql).toContain(
      "('05001', '05', 'Medellín', 'medellin', 'MUNICIPIO', true, -75.581775, 6.246631, '05001', array["
    )
  })

  it("no actualiza la clave primaria en el conflicto", () => {
    expect(sql).not.toMatch(/^\s+iso2 = excluded\.iso2/m)
    expect(sql).not.toMatch(/^\s+codigo = excluded\.codigo/m)
    expect(sql).toContain("capital_codigo = excluded.capital_codigo")
  })
})
