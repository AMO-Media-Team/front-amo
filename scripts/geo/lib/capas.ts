import mapshaper from "mapshaper"
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson"

import type { Bbox, Posicion } from "../../../src/lib/geo/tipos"
import { CODIGOS_HISTORICOS } from "../datos/municipios"
import {
  FUSIONES_NATURAL_EARTH,
  TERRITORIOS_SEPARADOS,
  type TerritorioSeparado,
} from "../datos/paises"
import type { ColeccionFuente } from "./fuentes"
import { redondear } from "./texto"

export type GeometriaArea = Polygon | MultiPolygon

/** Polígono ya procesado (disuelto, simplificado, limpio) con sus métricas. */
export interface GeometriaProcesada {
  readonly codigo: string
  readonly geometria: GeometriaArea
  readonly bbox: Bbox
  /** Punto interior (polo de inaccesibilidad aproximado): siempre cae dentro del polígono. */
  readonly puntoInterior: Posicion
}

interface ParametrosCapa {
  /**
   * Tolerancia de `snap` al importar, en grados. El archivo de departamentos trae
   * fronteras compartidas que no coinciden vértice a vértice; sin ajustarlas, la
   * topología queda partida en arcos diminutos que la simplificación no puede quitar.
   */
  readonly ajuste: number | null
  /** Porcentaje de vértices removibles que se conserva, o `interval=<metros>`. */
  readonly simplificacion: string
  readonly precision: number
}

/**
 * Visvalingam ponderado de mapshaper; `keep-shapes` evita que desaparezcan islas y
 * municipios pequeños. Tamaños resultantes y criterios en docs/geodatos.md.
 */
export const PARAMETROS = {
  departamentos: { ajuste: 0.0005, simplificacion: "20%", precision: 0.0001 },
  paises: { ajuste: null, simplificacion: "60%", precision: 0.001 },
  /** Tolerancia absoluta (3 km ≈ 2 px a 1000 px de ancho): no depende de qué polígonos entren. */
  svg: { ajuste: 0.0005, simplificacion: "interval=3000", precision: 0.001 },
} as const satisfies Record<string, ParametrosCapa>

/**
 * Cada archivo municipal se ve encuadrado en su departamento, así que la tolerancia
 * se fija por departamento: su diagonal / 800 (≈1,4 px en un mapa de ~1100 px de
 * diagonal). Un porcentaje global dejaba San Andrés con 9 vértices y municipios del
 * Quindío con 5, porque Visvalingam descarta primero lo pequeño.
 */
const DIVISOR_TOLERANCIA_MUNICIPAL = 800
const PRECISION_MUNICIPAL = 0.0001
const METROS_POR_GRADO = 111_320

const DECIMALES_METRICAS = 4

type Disolucion = "no" | "antes" | "despues"

interface PropiedadesSalida {
  codigo: string
  _bbox: [number, number, number, number]
  _x: number
  _y: number
}

async function procesar(
  entrada: FeatureCollection,
  { ajuste, simplificacion, precision }: ParametrosCapa,
  disolucion: Disolucion
): Promise<GeometriaProcesada[]> {
  const disolver = "-dissolve codigo"
  const comandos = [
    "-quiet",
    ajuste === null
      ? "-i entrada.json snap"
      : `-i entrada.json snap snap-interval=${ajuste}`,
    disolucion === "antes" ? disolver : "",
    `-simplify ${simplificacion} keep-shapes weighting=0.7`,
    disolucion === "despues" ? disolver : "",
    "-clean",
    '-each "_bbox=this.bounds, _x=this.innerX, _y=this.innerY"',
    `-o salida.json format=geojson precision=${precision}`,
  ].filter(Boolean)

  const salida = await mapshaper.applyCommands(comandos.join(" "), {
    "entrada.json": entrada,
  })
  const coleccion = JSON.parse(salida["salida.json"]) as FeatureCollection<
    Geometry,
    PropiedadesSalida
  >
  return coleccion.features
    .map(aGeometriaProcesada)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
}

function aGeometriaProcesada(
  feature: Feature<Geometry, PropiedadesSalida>
): GeometriaProcesada {
  const { codigo, _bbox, _x, _y } = feature.properties
  const geometria = feature.geometry
  if (geometria.type !== "Polygon" && geometria.type !== "MultiPolygon") {
    throw new Error(`La geometría ${codigo} no es un área (${geometria.type})`)
  }
  const r = (valor: number) => redondear(valor, DECIMALES_METRICAS)
  return {
    codigo,
    geometria,
    bbox: [r(_bbox[0]), r(_bbox[1]), r(_bbox[2]), r(_bbox[3])],
    puntoInterior: [r(_x), r(_y)],
  }
}

export function unirBboxes(bboxes: readonly Bbox[]): Bbox {
  if (bboxes.length === 0) throw new Error("No hay envolventes para unir")
  return [
    Math.min(...bboxes.map((b) => b[0])),
    Math.min(...bboxes.map((b) => b[1])),
    Math.max(...bboxes.map((b) => b[2])),
    Math.max(...bboxes.map((b) => b[3])),
  ]
}

function conCodigo(
  fuente: ColeccionFuente,
  codigoDe: (propiedades: Record<string, unknown>) => string
) {
  return {
    type: "FeatureCollection" as const,
    features: fuente.features.map((feature) => ({
      type: "Feature" as const,
      properties: { codigo: codigoDe(feature.properties) },
      geometry: feature.geometry,
    })),
  }
}

/**
 * Aplica códigos históricos, separa por departamento y en cada uno disuelve por
 * código (une partes como Ubalá o Timbiquí y las islas fusionadas) y simplifica
 * con una tolerancia proporcional a su extensión.
 */
export async function procesarMunicipios(
  fuente: ColeccionFuente
): Promise<GeometriaProcesada[]> {
  const entrada = conCodigo(fuente, (p) =>
    codigoMunicipalVigente(String(p.MPIOS))
  )
  const porDepartamento = new Map<string, typeof entrada.features>()
  for (const feature of entrada.features) {
    const dpto = feature.properties.codigo.slice(0, 2)
    porDepartamento.set(dpto, [...(porDepartamento.get(dpto) ?? []), feature])
  }

  const resultado: GeometriaProcesada[] = []
  for (const dpto of [...porDepartamento.keys()].sort()) {
    const features = porDepartamento.get(dpto) ?? []
    const tolerancia = Math.round(
      diagonalEnMetros(features) / DIVISOR_TOLERANCIA_MUNICIPAL
    )
    const parametros: ParametrosCapa = {
      ajuste: null,
      simplificacion: `interval=${tolerancia}`,
      precision: PRECISION_MUNICIPAL,
    }
    const capa = { type: "FeatureCollection" as const, features }
    resultado.push(...(await procesar(capa, parametros, "antes")))
  }
  return resultado.sort((a, b) => a.codigo.localeCompare(b.codigo))
}

/** Diagonal aproximada (equirectangular) de la envolvente de un grupo de polígonos. */
function diagonalEnMetros(features: readonly { geometry: Geometry }[]): number {
  let [oeste, sur, este, norte] = [180, 90, -180, -90]
  for (const { geometry } of features) {
    for (const [lon, lat] of posicionesDe(geometry)) {
      oeste = Math.min(oeste, lon)
      este = Math.max(este, lon)
      sur = Math.min(sur, lat)
      norte = Math.max(norte, lat)
    }
  }
  const latitudMedia = ((sur + norte) / 2) * (Math.PI / 180)
  const ancho = (este - oeste) * METROS_POR_GRADO * Math.cos(latitudMedia)
  const alto = (norte - sur) * METROS_POR_GRADO
  return Math.hypot(ancho, alto)
}

function posicionesDe(geometria: Geometry): number[][] {
  if (geometria.type === "Polygon") return geometria.coordinates.flat()
  if (geometria.type === "MultiPolygon") return geometria.coordinates.flat(2)
  throw new Error(`Geometría municipal inesperada: ${geometria.type}`)
}

export function codigoMunicipalVigente(codigoFuente: string): string {
  return CODIGOS_HISTORICOS[codigoFuente] ?? codigoFuente
}

export function procesarDepartamentos(
  fuente: ColeccionFuente
): Promise<GeometriaProcesada[]> {
  return procesar(
    conCodigo(fuente, (p) => String(p.DPTO)),
    PARAMETROS.departamentos,
    "no"
  )
}

/** Departamentos muy simplificados para los mini-mapas SVG. */
export function procesarDepartamentosSvg(
  fuente: ColeccionFuente
): Promise<GeometriaProcesada[]> {
  return procesar(
    conCodigo(fuente, (p) => String(p.DPTO)),
    PARAMETROS.svg,
    "no"
  )
}

/**
 * Sustituye el polígono de un departamento por la unión de sus polígonos municipales.
 * Pensado para el archipiélago de San Andrés (≈50 km² en islas sueltas): la
 * simplificación nacional dejaba Providencia con 7 vértices y borraba Santa Catalina,
 * mientras que sus municipios ya vienen simplificados a la escala del departamento.
 * Solo es válido si esos municipios no comparten fronteras con otro departamento.
 */
export function departamentoDesdeMunicipios(
  departamentos: readonly GeometriaProcesada[],
  municipios: readonly GeometriaProcesada[],
  { codigo, capitalCodigo }: { codigo: string; capitalCodigo: string }
): GeometriaProcesada[] {
  const propios = municipios.filter((m) => m.codigo.startsWith(codigo))
  const capital = propios.find((m) => m.codigo === capitalCodigo)
  if (!capital)
    throw new Error(`Sin polígono de la capital ${capitalCodigo} (${codigo})`)
  const union: GeometriaProcesada = {
    codigo,
    geometria: {
      type: "MultiPolygon",
      coordinates: propios.flatMap((m) => poligonosDe(m.geometria)),
    },
    bbox: unirBboxes(propios.map((m) => m.bbox)),
    // El punto interior de la isla capital, que es la mayor.
    puntoInterior: capital.puntoInterior,
  }
  return departamentos.map((d) => (d.codigo === codigo ? union : d))
}

function poligonosDe(geometria: GeometriaArea): Position[][][] {
  return geometria.type === "Polygon"
    ? [geometria.coordinates]
    : geometria.coordinates
}

/**
 * Unión de los departamentos indicados (contorno nacional para el SVG). Se disuelve
 * después de simplificar para que el contorno coincida con los paths departamentales.
 */
export async function procesarContorno(
  fuente: ColeccionFuente,
  codigos: ReadonlySet<string>
) {
  const entrada = conCodigo(
    {
      ...fuente,
      features: fuente.features.filter((f) =>
        codigos.has(String(f.properties.DPTO))
      ),
    },
    () => "CO"
  )
  const [contorno] = await procesar(entrada, PARAMETROS.svg, "despues")
  return contorno
}

/** Código ISO2 del país que representa cada unidad de Natural Earth. */
export function iso2DeNaturalEarth(
  propiedades: Record<string, unknown>
): string {
  const adm0 = String(propiedades.ADM0_A3)
  const iso2 = FUSIONES_NATURAL_EARTH[adm0] ?? String(propiedades.ISO_A2_EH)
  if (!/^[A-Z]{2}$/.test(iso2))
    throw new Error(`Sin ISO2 para ${adm0} (${String(propiedades.NAME)})`)
  return iso2
}

/** ADM0_A3 de la unidad principal de cada país (la que no es una fusión como CYN o SOL). */
export function adm0PrincipalPorIso2(
  fuente: ColeccionFuente
): Map<string, string> {
  const principal = new Map<string, string>()
  for (const { properties } of fuente.features) {
    const adm0 = String(properties.ADM0_A3)
    const iso2 = iso2DeNaturalEarth(properties)
    const esFusion = adm0 in FUSIONES_NATURAL_EARTH
    if (!principal.has(iso2) || !esFusion) principal.set(iso2, adm0)
  }
  return principal
}

export function procesarPaises(
  fuente: ColeccionFuente
): Promise<GeometriaProcesada[]> {
  const entrada = {
    type: "FeatureCollection" as const,
    features: fuente.features.flatMap(partesPorPais),
  }
  return procesar(entrada, PARAMETROS.paises, "antes")
}

/**
 * Asigna cada unidad de Natural Earth a su ISO2 y separa las partes que pertenecen a
 * un territorio con ISO propio (`TERRITORIOS_SEPARADOS`); el `-dissolve` posterior
 * vuelve a unir las partes que comparten código.
 */
function partesPorPais(
  feature: ColeccionFuente["features"][number]
): Feature<Geometry, { codigo: string }>[] {
  const iso2 = iso2DeNaturalEarth(feature.properties)
  const territorios = TERRITORIOS_SEPARADOS[String(feature.properties.ADM0_A3)]
  const { geometry } = feature
  if (!territorios || geometry.type !== "MultiPolygon")
    return [{ type: "Feature", properties: { codigo: iso2 }, geometry }]

  return geometry.coordinates.map((poligono) => ({
    type: "Feature",
    properties: { codigo: territorioDe(poligono, territorios) ?? iso2 },
    geometry: { type: "Polygon", coordinates: poligono },
  }))
}

function territorioDe(
  poligono: Position[][],
  territorios: readonly TerritorioSeparado[]
): string | undefined {
  const [lon, lat] = poligono[0][0]
  return territorios.find(
    ({ envolvente: [oeste, sur, este, norte] }) =>
      lon >= oeste && lon <= este && lat >= sur && lat <= norte
  )?.iso2
}
