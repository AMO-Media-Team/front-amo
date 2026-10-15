// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { FeatureCollection, Geometry } from "geojson"
import { describe, expect, it } from "vitest"

import {
  listarDepartamentos,
  listarMunicipios,
  listarPaises,
  obtenerMunicipio,
  obtenerPais,
} from "./catalogo"
import { proyectarEnMapaColombia } from "./mapa-svg"
import { resolverPais } from "./resolver"
import {
  CONTORNO_COLOMBIA,
  PATHS_DEPARTAMENTOS,
  RECUADRO_SAN_ANDRES,
  VIEWBOX_COLOMBIA,
} from "./svg-departamentos"
import type { Bbox } from "./tipos"

type Propiedades = Record<string, string>

function leerGeoJson(ruta: string): FeatureCollection<Geometry, Propiedades> {
  const archivo = join(process.cwd(), "public/data/geo", ruta)
  return JSON.parse(readFileSync(archivo, "utf8")) as FeatureCollection<
    Geometry,
    Propiedades
  >
}

const codigos = (coleccion: FeatureCollection<Geometry, Propiedades>) =>
  coleccion.features.map((f) => f.properties.codigo)

const sinRepetidos = (lista: readonly string[]) =>
  expect(new Set(lista).size).toBe(lista.length)

type FeatureGeo = FeatureCollection<Geometry, Propiedades>["features"][number]

function posiciones({ geometry }: FeatureGeo): number[][] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat()
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2)
  throw new Error(`Geometría inesperada: ${geometry.type}`)
}

function envolventeDe(feature: FeatureGeo): Bbox {
  const puntos = posiciones(feature)
  const lons = puntos.map((p) => p[0])
  const lats = puntos.map((p) => p[1])
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ]
}

const contarVertices = (feature: FeatureGeo) => posiciones(feature).length

const bboxValido = ([oeste, sur, este, norte]: Bbox) =>
  oeste <= este && sur <= norte && oeste >= -180 && norte <= 90

const departamentos = listarDepartamentos()
const municipios = listarMunicipios()

describe("public/data/geo/paises.json", () => {
  const paises = leerGeoJson("paises.json")

  it("tiene códigos ISO2 únicos, solo las propiedades necesarias y cada uno resuelve", () => {
    sinRepetidos(codigos(paises))
    for (const { properties } of paises.features) {
      expect(Object.keys(properties).sort()).toEqual([
        "adm0_a3",
        "codigo",
        "nombre",
      ])
      expect(resolverPais(properties.codigo)?.iso2).toBe(properties.codigo)
      expect(resolverPais(properties.adm0_a3)?.iso2).toBe(properties.codigo)
      expect(obtenerPais(properties.codigo)?.conGeometria).toBe(true)
    }
  })

  it("coincide con los países marcados con geometría en el diccionario", () => {
    const conGeometria = listarPaises().filter((p) => p.conGeometria)
    expect(paises.features).toHaveLength(conGeometria.length)
  })

  it("separa de su metrópoli los territorios con ISO propio", () => {
    const envolvente = (codigo: string) =>
      envolventeDe(paises.features.find((f) => f.properties.codigo === codigo)!)
    // Francia sin la Guayana Francesa; Noruega sin Svalbard.
    expect(envolvente("FR")[0]).toBeGreaterThan(-10)
    expect(envolvente("NO")[3]).toBeLessThan(72)
    expect(envolvente("GF")[0]).toBeLessThan(-51)
    expect(envolvente("SJ")[1]).toBeGreaterThan(74)
  })
})

describe("diccionario de países", () => {
  const paises = listarPaises()

  it("cubre ISO 3166-1 completo (249) más Kosovo", () => {
    expect(paises).toHaveLength(250)
    expect(paises.filter((p) => p.numerico !== null)).toHaveLength(249)
    sinRepetidos(paises.map((p) => p.iso2))
    sinRepetidos(paises.map((p) => p.iso3))
  })

  it("marca con geometría los países que Natural Earth dibuja y no los microestados", () => {
    for (const iso2 of ["FR", "NO", "XK", "TW", "CY", "SO", "GF", "SJ"])
      expect(obtenerPais(iso2)?.conGeometria).toBe(true)
    for (const iso2 of ["AD", "MC", "SM", "VA", "LI", "MT", "SG", "BH"])
      expect(obtenerPais(iso2)?.conGeometria).toBe(false)
  })

  it("no reparte un mismo nombre o alias entre dos países", () => {
    sinRepetidos(paises.flatMap((p) => [p.nombreNormalizado, ...p.alias]))
  })

  it("todo país tiene centroide válido y continente", () => {
    for (const pais of paises) {
      const [lon, lat] = pais.centroide
      expect(Math.abs(lon)).toBeLessThanOrEqual(180)
      expect(Math.abs(lat)).toBeLessThanOrEqual(90)
      expect(pais.continente).toBeTruthy()
    }
  })
})

describe("public/data/geo/departamentos.json", () => {
  const coleccion = leerGeoJson("departamentos.json")

  it("tiene los 33 departamentos con código único y nombre oficial", () => {
    expect(coleccion.features).toHaveLength(33)
    sinRepetidos(codigos(coleccion))
    const porCodigo = new Map(departamentos.map((d) => [d.codigo, d.nombre]))
    for (const { properties } of coleccion.features) {
      expect(Object.keys(properties).sort()).toEqual(["codigo", "nombre"])
      expect(properties.nombre).toBe(porCodigo.get(properties.codigo))
    }
  })

  it("cada polígono coincide con la envolvente de sus municipios (la del zoom al bajar de nivel)", () => {
    const tolerancia = 0.05
    for (const feature of coleccion.features) {
      const esperado = departamentos.find(
        (d) => d.codigo === feature.properties.codigo
      )!.bbox
      envolventeDe(feature).forEach((valor, i) =>
        expect(Math.abs(valor - esperado[i])).toBeLessThanOrEqual(tolerancia)
      )
    }
  })

  it("dibuja el archipiélago con sus islas municipales, no con la simplificación nacional", () => {
    const archipielago = coleccion.features.find(
      (f) => f.properties.codigo === "88"
    )!
    const islas = leerGeoJson("municipios/88.json").features
    expect(contarVertices(archipielago)).toBe(
      islas.reduce((total, isla) => total + contarVertices(isla), 0)
    )
  })
})

describe("diccionario de departamentos", () => {
  it("tiene 33 departamentos con capital, población y envolvente válidas", () => {
    expect(departamentos).toHaveLength(33)
    for (const departamento of departamentos) {
      expect(obtenerMunicipio(departamento.capitalCodigo)?.esCapital).toBe(true)
      expect(departamento.poblacion).toBeGreaterThan(40_000)
      expect(departamento.iso31662).toMatch(/^CO-[A-Z]{2,3}$/)
      expect(bboxValido(departamento.bbox)).toBe(true)
    }
    sinRepetidos(departamentos.map((d) => d.iso31662))
    const total = departamentos.reduce((suma, d) => suma + d.poblacion, 0)
    expect(total).toBeGreaterThan(50_000_000)
  })

  it("usa los nombres oficiales con tildes", () => {
    const nombre = (codigo: string) =>
      departamentos.find((d) => d.codigo === codigo)?.nombre
    expect(nombre("11")).toBe("Bogotá, D.C.")
    expect(nombre("52")).toBe("Nariño")
    expect(nombre("88")).toBe(
      "Archipiélago de San Andrés, Providencia y Santa Catalina"
    )
  })
})

describe("public/data/geo/municipios/{DPTO}.json", () => {
  const porDepartamento = new Map(
    departamentos.map((d) => [
      d.codigo,
      leerGeoJson(`municipios/${d.codigo}.json`),
    ])
  )
  const todos = [...porDepartamento.values()].flatMap((c) => c.features)

  it("hay un archivo por departamento con códigos únicos en todo el país", () => {
    expect(porDepartamento.size).toBe(33)
    sinRepetidos(todos.map((f) => f.properties.codigo))
    for (const [dpto, coleccion] of porDepartamento) {
      for (const { properties } of coleccion.features) {
        expect(properties.dpto).toBe(dpto)
        expect(properties.codigo.startsWith(dpto)).toBe(true)
        expect(Object.keys(properties).sort()).toEqual([
          "codigo",
          "dpto",
          "nombre",
        ])
      }
    }
  })

  it("cada polígono corresponde a un municipio del diccionario", () => {
    for (const { properties } of todos) {
      const municipio = obtenerMunicipio(properties.codigo)
      expect(municipio?.codigoGeometria).toBe(properties.codigo)
      expect(properties.nombre).toBe(municipio?.nombre)
    }
  })

  it("los 1.122 códigos DIVIPOLA tienen su polígono en el archivo de su departamento", () => {
    expect(municipios).toHaveLength(1122)
    for (const municipio of municipios) {
      const archivo = porDepartamento.get(municipio.departamentoCodigo)
      expect(codigos(archivo!)).toContain(municipio.codigoGeometria)
    }
  })
})

describe("diccionario de municipios", () => {
  it("formatea los nombres oficiales en español", () => {
    const nombre = (codigo: string) => obtenerMunicipio(codigo)?.nombre
    expect(nombre("05001")).toBe("Medellín")
    expect(nombre("11001")).toBe("Bogotá, D.C.")
    expect(nombre("54001")).toBe("San José de Cúcuta")
    expect(nombre("05148")).toBe("El Carmen de Viboral")
    expect(nombre("19548")).toBe("Piendamó - Tunía")
    expect(nombre("95001")).toBe("San José del Guaviare")
  })

  it("clasifica tipos y capitales", () => {
    const tipos = new Map<string, number>()
    for (const m of municipios) tipos.set(m.tipo, (tipos.get(m.tipo) ?? 0) + 1)
    expect(Object.fromEntries(tipos)).toEqual({
      MUNICIPIO: 1103,
      AREA_NO_MUNICIPALIZADA: 18,
      ISLA: 1,
    })
    expect(municipios.filter((m) => m.esCapital)).toHaveLength(32)
  })

  it("la cabecera DIVIPOLA cae dentro (o al borde) del polígono que la dibuja", () => {
    // La cartografía fuente es anterior a algunos ajustes de límites: se tolera ~20 km.
    const tolerancia = 0.2
    for (const { centroide, bbox } of municipios) {
      const [lon, lat] = centroide
      const [oeste, sur, este, norte] = bbox
      expect(lon).toBeGreaterThanOrEqual(oeste - tolerancia)
      expect(lon).toBeLessThanOrEqual(este + tolerancia)
      expect(lat).toBeGreaterThanOrEqual(sur - tolerancia)
      expect(lat).toBeLessThanOrEqual(norte + tolerancia)
    }
  })
})

describe("svg-departamentos", () => {
  const [, , ancho, alto] = VIEWBOX_COLOMBIA.split(" ").map(Number)

  it("tiene un path cerrado por departamento y el contorno nacional", () => {
    expect(Object.keys(PATHS_DEPARTAMENTOS).sort()).toEqual(
      departamentos.map((d) => d.codigo)
    )
    for (const path of [
      ...Object.values(PATHS_DEPARTAMENTOS),
      CONTORNO_COLOMBIA,
    ]) {
      expect(path).toMatch(/^M[\d.,\sLZM]+Z$/)
    }
  })

  it("proyecta todas las cabeceras dentro del lienzo y San Andrés en su recuadro", () => {
    for (const { centroide } of municipios) {
      const [x, y] = proyectarEnMapaColombia(centroide)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(ancho)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(alto)
    }
    const { x: rx, y: ry, ancho: ra, alto: rh } = RECUADRO_SAN_ANDRES
    for (const codigo of ["88001", "88564"]) {
      const [x, y] = proyectarEnMapaColombia(
        obtenerMunicipio(codigo)!.centroide
      )
      expect(x).toBeGreaterThan(rx)
      expect(x).toBeLessThan(rx + ra)
      expect(y).toBeGreaterThan(ry)
      expect(y).toBeLessThan(ry + rh)
    }
  })
})
