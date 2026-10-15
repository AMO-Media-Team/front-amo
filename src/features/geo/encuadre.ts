/**
 * Qué se dibuja y dónde mira la cámara en cada nivel. Módulo puro apto para
 * el cliente (solo usa el diccionario de departamentos).
 */
import type { Encuadre } from "@/components/maps/tipos"
import type { Bbox, Posicion } from "@/lib/geo/tipos"

import {
  departamentoPorCodigo,
  listarDepartamentosCliente,
} from "./departamentos"
import type { EstadoNivel } from "./niveles"

/** Centro de Colombia: el globo siempre arranca mirando al país. */
export const CENTRO_COLOMBIA: Posicion = [-73.6, 4.2]

/** Envolvente de todos los departamentos (incluye el archipiélago de San Andrés). */
export const BBOX_COLOMBIA: Bbox = listarDepartamentosCliente().reduce<Bbox>(
  ([oeste, sur, este, norte], { bbox }) => [
    Math.min(oeste, bbox[0]),
    Math.min(sur, bbox[1]),
    Math.max(este, bbox[2]),
    Math.max(norte, bbox[3]),
  ],
  [Infinity, Infinity, -Infinity, -Infinity]
)

/** Zoom del globo según el ancho disponible: el continente americano cabe completo. */
export function zoomGlobo(anchoPx: number): number {
  if (anchoPx <= 0) return 1.4
  const zoom = Math.log2(anchoPx / 512) + 1.15
  return Math.round(Math.min(2, Math.max(0.85, zoom)) * 100) / 100
}

export function encuadreDelNivel(
  estado: EstadoNivel,
  anchoPx: number
): Encuadre {
  if (estado.nivel === "internacional") {
    return { tipo: "centro", centro: CENTRO_COLOMBIA, zoom: zoomGlobo(anchoPx) }
  }
  const departamento =
    estado.nivel === "departamental"
      ? departamentoPorCodigo(estado.departamento)
      : undefined
  return { tipo: "limites", bbox: departamento?.bbox ?? BBOX_COLOMBIA }
}

/** GeoJSON optimizado del nivel (servido como estático por el CDN). */
export function urlGeometria(estado: EstadoNivel): string {
  switch (estado.nivel) {
    case "internacional":
      return "/data/geo/paises.json"
    case "nacional":
      return "/data/geo/departamentos.json"
    case "departamental":
      return `/data/geo/municipios/${estado.departamento ?? "00"}.json`
  }
}

/** Identificador estable del ámbito (nivel + departamento). */
export function claveAmbito(estado: EstadoNivel): string {
  return estado.nivel === "departamental"
    ? `departamental-${estado.departamento}`
    : estado.nivel
}
