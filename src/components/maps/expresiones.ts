/**
 * Pinturas de las capas del mapa coroplético (Mapbox) por tema. Módulo puro:
 * colores en HEX/rgba (Mapbox no interpreta `oklch()`), estado por
 * `feature-state` (`color`, `radio`, `hover`, `seleccionado`, `destacado`).
 */
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  HeatmapLayerSpecification,
  LineLayerSpecification,
} from "react-map-gl/mapbox"

import { COLOR_SIN_DATOS, type TemaMapa } from "@/lib/geo/escalas"

type PinturaRelleno = NonNullable<FillLayerSpecification["paint"]>
type PinturaLinea = NonNullable<LineLayerSpecification["paint"]>
type PinturaCirculo = NonNullable<CircleLayerSpecification["paint"]>
type PinturaCalor = NonNullable<HeatmapLayerSpecification["paint"]>

/** Colores de apoyo del mapa (bordes, realces, calor) por tema. */
export const COLORES_MAPA: Readonly<
  Record<
    TemaMapa,
    {
      readonly borde: string
      readonly realce: string
      readonly seleccion: string
      readonly resplandor: string
      readonly rayado: string
      readonly calor: readonly string[]
    }
  >
> = {
  oscuro: {
    borde: "rgba(242, 239, 250, 0.22)",
    realce: "#C3AEFB",
    seleccion: "#F6F3FF",
    resplandor: "#A788F6",
    rayado: "rgba(242, 239, 250, 0.16)",
    calor: [
      "rgba(63, 42, 118, 0)",
      "#4F2F98",
      "#7549DE",
      "#A788F6",
      "#DCD0FD",
      "#FFFFFF",
    ],
  },
  claro: {
    borde: "rgba(38, 24, 72, 0.28)",
    realce: "#6238BF",
    seleccion: "#261848",
    resplandor: "#8C66EE",
    rayado: "rgba(38, 24, 72, 0.16)",
    calor: [
      "rgba(237, 231, 254, 0)",
      "#C3AEFB",
      "#8C66EE",
      "#6238BF",
      "#3F2A76",
      "#261848",
    ],
  },
}

/** Nombre de la imagen del patrón "sin datos" registrada en el mapa. */
export const imagenRayado = (tema: TemaMapa) => `amo-rayado-${tema}`

/**
 * Mapbox Standard ilumina las capas propias con su preset de luz (de noche
 * quedarían casi negras) y el tema monocromo las desatura con su tabla de
 * color. Las capas del coroplético son datos: brillo propio y color exacto.
 */
const SIN_LUZ_RELLENO = {
  "fill-emissive-strength": 1,
  "fill-color-use-theme": "none",
} as const
const SIN_LUZ_LINEA = {
  "line-emissive-strength": 1,
  "line-color-use-theme": "none",
} as const

const estado = (clave: string) =>
  ["boolean", ["feature-state", clave], false] as const

const SIN_COLOR = ["==", ["feature-state", "color"], null] as const

/**
 * Foco de la leyenda: sin foco se ve todo; con foco en unas clases solo
 * brillan las zonas marcadas `destacado`; con foco en "sin datos", las que no
 * tienen color.
 */
export type FocoMapa = "ninguno" | "destacados" | "sin-datos"

function enFoco(foco: FocoMapa) {
  return foco === "sin-datos" ? SIN_COLOR : estado("destacado")
}

export interface OpcionesPintura {
  readonly calor: boolean
  readonly foco: FocoMapa
  /**
   * Rayar las zonas sin dato. En el mapa mundial no se raya: casi todos los
   * países carecen de registros y el patrón taparía la señal.
   */
  readonly rayar: boolean
}

/** Relleno coroplético: el color llega por `feature-state` (animado desde JS). */
export function pinturaRelleno(
  tema: TemaMapa,
  { calor, foco, rayar }: OpcionesPintura
): PinturaRelleno {
  // Sin rayado, las zonas sin dato quedan como tierra neutra y tenue.
  const sinDato = rayar ? 0.8 : 0.38
  const base =
    foco === "ninguno"
      ? ["case", SIN_COLOR, sinDato, 0.84]
      : ["case", enFoco(foco), 0.92, 0.16]
  return {
    ...SIN_LUZ_RELLENO,
    "fill-color": [
      "coalesce",
      ["feature-state", "color"],
      COLOR_SIN_DATOS[tema],
    ],
    "fill-opacity": calor
      ? 0.16
      : ["case", estado("seleccionado"), 0.96, estado("hover"), 0.92, base],
  }
}

/** Rayado encima de las zonas sin dato (distinto del valor cero, que sí colorea). */
export function pinturaSinDatos(
  tema: TemaMapa,
  { calor, foco, rayar }: OpcionesPintura
): PinturaRelleno {
  const visible = foco === "destacados" ? 0.25 : 1
  return {
    ...SIN_LUZ_RELLENO,
    "fill-pattern": imagenRayado(tema),
    "fill-opacity": calor || !rayar ? 0 : ["case", SIN_COLOR, visible, 0],
  }
}

export function pinturaBorde(tema: TemaMapa): PinturaLinea {
  return {
    ...SIN_LUZ_LINEA,
    "line-color": COLORES_MAPA[tema].borde,
    "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 8, 1.1],
  }
}

/** Contorno de la zona en hover o seleccionada. */
export function pinturaRealce(tema: TemaMapa): PinturaLinea {
  const colores = COLORES_MAPA[tema]
  return {
    ...SIN_LUZ_LINEA,
    "line-color": [
      "case",
      estado("seleccionado"),
      colores.seleccion,
      colores.realce,
    ],
    "line-width": [
      "case",
      estado("seleccionado"),
      2.4,
      estado("hover"),
      1.6,
      0,
    ],
    "line-opacity": [
      "case",
      ["any", estado("seleccionado"), estado("hover")],
      1,
      0,
    ],
  }
}

/** Halo difuso bajo el contorno de la zona seleccionada. */
export function pinturaResplandor(tema: TemaMapa): PinturaLinea {
  return {
    ...SIN_LUZ_LINEA,
    "line-color": COLORES_MAPA[tema].resplandor,
    "line-width": 9,
    "line-blur": 7,
    "line-opacity": ["case", estado("seleccionado"), 0.55, 0],
  }
}

/** Países sin polígono: círculos proporcionales (radio en `feature-state`). */
export function pinturaCirculos(
  tema: TemaMapa,
  { calor, foco }: Pick<OpcionesPintura, "calor" | "foco">
): PinturaCirculo {
  const colores = COLORES_MAPA[tema]
  // En modo calor los círculos ceden el protagonismo a la densidad.
  const opacidad = calor
    ? 0.18
    : foco === "ninguno"
      ? 0.92
      : ["case", enFoco(foco), 0.95, 0.22]
  return {
    "circle-emissive-strength": 1,
    "circle-color-use-theme": "none",
    "circle-radius": ["coalesce", ["feature-state", "radio"], 0],
    "circle-color": [
      "coalesce",
      ["feature-state", "color"],
      COLOR_SIN_DATOS[tema],
    ],
    "circle-opacity": [
      "case",
      [">", ["coalesce", ["feature-state", "radio"], 0], 0],
      opacidad,
      0,
    ],
    "circle-stroke-color": [
      "case",
      estado("seleccionado"),
      colores.seleccion,
      colores.realce,
    ],
    "circle-stroke-width": [
      "case",
      estado("seleccionado"),
      2.4,
      estado("hover"),
      1.6,
      0.6,
    ],
    "circle-stroke-opacity": [
      "case",
      [">", ["coalesce", ["feature-state", "radio"], 0], 0],
      1,
      0,
    ],
  }
}

/** Mapa de calor sobre puntos reales; `pesoMaximo` normaliza el peso de cada punto. */
export function pinturaCalor(tema: TemaMapa, pesoMaximo: number): PinturaCalor {
  const rampa = COLORES_MAPA[tema].calor
  return {
    "heatmap-color-use-theme": "none",
    "heatmap-weight": [
      "interpolate",
      ["linear"],
      ["get", "peso"],
      0,
      0,
      Math.max(pesoMaximo, 1),
      1,
    ],
    "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 9, 2.4],
    "heatmap-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      0,
      6,
      4,
      16,
      7,
      28,
      11,
      44,
    ],
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      rampa[0],
      0.15,
      rampa[1],
      0.35,
      rampa[2],
      0.6,
      rampa[3],
      0.85,
      rampa[4],
      1,
      rampa[5],
    ],
    "heatmap-opacity": 0.88,
  }
}

/** Radio de un círculo proporcional al área (√valor), entre 4 y 22 px. */
export function radioCirculo(valor: number | null, maximo: number): number {
  if (valor === null || !(valor > 0) || !(maximo > 0)) return 0
  return 4 + 18 * Math.sqrt(Math.min(valor / maximo, 1))
}

// ── Color ─────────────────────────────────────────────────────────────────────

function aRgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "")
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio
  const numero = Number.parseInt(completo, 16)
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255]
}

const aHex = (canal: number) =>
  Math.round(Math.min(255, Math.max(0, canal)))
    .toString(16)
    .padStart(2, "0")

/** Interpola dos colores HEX (t ∈ [0, 1]) para animar el cambio de clase. */
export function interpolarColor(
  desde: string,
  hasta: string,
  t: number
): string {
  const a = aRgb(desde)
  const b = aRgb(hasta)
  const f = Math.min(1, Math.max(0, t))
  return `#${aHex(a[0] + (b[0] - a[0]) * f)}${aHex(a[1] + (b[1] - a[1]) * f)}${aHex(a[2] + (b[2] - a[2]) * f)}`
}

/** Curva de salida suave (misma sensación que `--ease-suave`). */
export const suavizar = (t: number) => 1 - (1 - t) ** 3
