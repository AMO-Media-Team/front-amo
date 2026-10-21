/**
 * Mini-mapa de Colombia como SVG autónomo (colores ya resueltos, sin CSS ni
 * variables) para rasterizarlo e incrustarlo en el PDF del reporte. Usa la
 * misma escala por cuantiles y los mismos trazos que `MiniMapaColombia`, en
 * tema claro (los documentos se imprimen sobre blanco). Módulo puro.
 */
import { formatearValorGeo } from "@/features/geo/formato"
import type { MetricaGeo } from "@/features/geo/metricas"
import { crearEscalaCuantiles, type TemaMapa } from "@/lib/geo/escalas"
import {
  PATHS_DEPARTAMENTOS,
  RECUADRO_SAN_ANDRES,
  VIEWBOX_COLOMBIA,
} from "@/lib/geo/svg-departamentos"

export interface ClaseLeyendaMapa {
  nombre: string
  color: string
  /** "Sin datos" se dibuja rayado. */
  rayado?: boolean
}

export interface MapaSvg {
  svg: string
  /** Tamaño en píxeles CSS (respeta la proporción del `viewBox`). */
  ancho: number
  alto: number
  leyenda: ClaseLeyendaMapa[]
}

export interface EntradaMapaSvg {
  valores: Readonly<Record<string, number | null>>
  metrica: MetricaGeo
  destacado?: string | null
  ancho?: number
  tema?: TemaMapa
}

const COLORES: Readonly<
  Record<
    TemaMapa,
    { borde: string; destacado: string; rayado: string; recuadro: string }
  >
> = {
  claro: {
    borde: "#FFFFFF",
    destacado: "#1B1528",
    rayado: "#C9C2D9",
    recuadro: "#D9D3E6",
  },
  oscuro: {
    borde: "#0E0B16",
    destacado: "#F2EFFA",
    rayado: "#3A3150",
    recuadro: "#2A2338",
  },
}

const ID_RAYADO = "amo-rayado"

function dimensionesViewBox(): { ancho: number; alto: number } {
  const [, , ancho, alto] = VIEWBOX_COLOMBIA.split(/\s+/).map(Number)
  return { ancho, alto }
}

function numeros(valores: EntradaMapaSvg["valores"]): number[] {
  return Object.values(valores).filter(
    (valor): valor is number => valor !== null && Number.isFinite(valor)
  )
}

/**
 * SVG del mapa con la leyenda de clases ("0+", "3+"…, "Sin datos"). El
 * departamento destacado lleva un borde oscuro más grueso y se dibuja al
 * final para que su contorno no quede tapado por los vecinos.
 */
export function mapaColombiaSvg({
  valores,
  metrica,
  destacado = null,
  ancho = 520,
  tema = "claro",
}: EntradaMapaSvg): MapaSvg {
  const escala = crearEscalaCuantiles(numeros(valores), { tema })
  const colores = COLORES[tema]
  const caja = dimensionesViewBox()
  const alto = Math.round((ancho * caja.alto) / caja.ancho)

  const codigos = Object.keys(PATHS_DEPARTAMENTOS).sort(
    (a, b) => Number(a === destacado) - Number(b === destacado)
  )
  const trazos = codigos.map((codigo) => {
    const valor = valores[codigo]
    const sinDato = valor === null || valor === undefined
    const relleno = sinDato ? `url(#${ID_RAYADO})` : escala.colorPara(valor)
    const esDestacado = codigo === destacado
    return `<path d="${PATHS_DEPARTAMENTOS[codigo]}" fill="${relleno}" stroke="${esDestacado ? colores.destacado : colores.borde}" stroke-width="${esDestacado ? 4 : 1.5}" stroke-linejoin="round"/>`
  })

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX_COLOMBIA}" width="${ancho}" height="${alto}">`,
    `<defs><pattern id="${ID_RAYADO}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`,
    `<rect width="10" height="10" fill="${escala.colorSinDatos}"/>`,
    `<line x1="0" y1="0" x2="0" y2="10" stroke="${colores.rayado}" stroke-width="3"/>`,
    `</pattern></defs>`,
    `<rect x="${RECUADRO_SAN_ANDRES.x}" y="${RECUADRO_SAN_ANDRES.y}" width="${RECUADRO_SAN_ANDRES.ancho}" height="${RECUADRO_SAN_ANDRES.alto}" rx="14" fill="none" stroke="${colores.recuadro}" stroke-width="2" stroke-dasharray="6 6"/>`,
    ...trazos,
    `</svg>`,
  ].join("")

  const leyenda: ClaseLeyendaMapa[] = [
    ...escala.leyenda.map((clase) => ({
      nombre: `${formatearValorGeo(clase.desde, metrica, { compacto: true })}${clase.hasta === null ? "+" : ""}`,
      color: clase.color,
    })),
    { nombre: "Sin datos", color: escala.colorSinDatos, rayado: true },
  ]

  return { svg, ancho, alto, leyenda }
}
