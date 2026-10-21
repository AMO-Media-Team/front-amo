/**
 * Planisferio en SVG sin Mapbox (mapas pequeños: accesos por país, reportes).
 * Proyección Equal Earth (Šavrič, Patterson y Jenny, 2018): de áreas iguales,
 * así un país grande no parece pesar más de lo que pesa su cifra. Recorta la
 * Antártida (ningún dato vive ahí y ocupa un tercio del alto).
 */
import type { Feature, FeatureCollection, Geometry, Position } from "geojson"

import type { Posicion } from "@/lib/geo/tipos"

const A1 = 1.340264
const A2 = -0.081106
const A3 = 0.000893
const A4 = 0.003796
const M = Math.sqrt(3) / 2
const RADIANES = Math.PI / 180

/** Coordenadas Equal Earth en unidades de la esfera unitaria (y crece hacia el norte). */
export function equalEarth([lon, lat]: Posicion): readonly [
  x: number,
  y: number,
] {
  const lambda = lon * RADIANES
  const theta = Math.asin(M * Math.sin(lat * RADIANES))
  const t2 = theta * theta
  const t6 = t2 * t2 * t2
  return [
    (lambda * Math.cos(theta)) /
      (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)),
  ]
}

export const ANCHO_MUNDO = 1000
/** Latitudes visibles: del cabo de Hornos al norte de Groenlandia. */
const LATITUD_SUR = -57
const LATITUD_NORTE = 84

const [X_MAXIMO] = equalEarth([180, 0])
const ESCALA = ANCHO_MUNDO / (2 * X_MAXIMO)
const Y_NORTE = equalEarth([0, LATITUD_NORTE])[1]
const Y_SUR = equalEarth([0, LATITUD_SUR])[1]

export const ALTO_MUNDO = Math.round((Y_NORTE - Y_SUR) * ESCALA)
export const VIEWBOX_MUNDO = `0 0 ${ANCHO_MUNDO} ${ALTO_MUNDO}`

/** Punto del lienzo (`VIEWBOX_MUNDO`) para una posición geográfica. */
export function proyectarEnMundo(
  posicion: Posicion
): readonly [x: number, y: number] {
  const [x, y] = equalEarth(posicion)
  return [
    Math.round((x + X_MAXIMO) * ESCALA * 10) / 10,
    Math.round((Y_NORTE - y) * ESCALA * 10) / 10,
  ]
}

function trazarAnillo(anillo: readonly Position[]): string {
  let trazo = ""
  let previo = ""
  for (const [lon, lat] of anillo) {
    const [x, y] = proyectarEnMundo([lon, Math.max(lat, LATITUD_SUR)])
    const punto = `${x},${y}`
    // A esta escala muchos vértices caen en el mismo décimo de unidad.
    if (punto === previo) continue
    trazo += `${trazo ? "L" : "M"}${punto}`
    previo = punto
  }
  return trazo ? `${trazo}Z` : ""
}

function trazarGeometria(geometria: Geometry): string {
  switch (geometria.type) {
    case "Polygon":
      return geometria.coordinates.map(trazarAnillo).join("")
    case "MultiPolygon":
      return geometria.coordinates
        .flatMap((poligono) => poligono.map(trazarAnillo))
        .join("")
    default:
      return ""
  }
}

export interface PaisTrazado {
  readonly codigo: string
  readonly nombre: string
  /** Atributo `d` del `<path>`. */
  readonly trazo: string
}

interface PropiedadesPais {
  readonly codigo: string
  readonly nombre: string
}

/** Códigos ISO2 que no se dibujan (Antártida). */
const EXCLUIDOS: ReadonlySet<string> = new Set(["AQ"])

const cache = new WeakMap<object, PaisTrazado[]>()

/**
 * Trazos SVG de los países del GeoJSON (`public/data/geo/paises.json`).
 * Se calculan una vez por colección (el mismo objeto que cachea React Query).
 */
export function trazarPaises(
  coleccion: FeatureCollection<Geometry, PropiedadesPais>
): PaisTrazado[] {
  const previo = cache.get(coleccion)
  if (previo) return previo
  const trazos = coleccion.features.flatMap(
    ({ properties, geometry }: Feature<Geometry, PropiedadesPais>) => {
      if (EXCLUIDOS.has(properties.codigo)) return []
      const trazo = trazarGeometria(geometry)
      return trazo
        ? [{ codigo: properties.codigo, nombre: properties.nombre, trazo }]
        : []
    }
  )
  cache.set(coleccion, trazos)
  return trazos
}
