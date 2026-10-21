/** Ensamblado de documentos SVG optimizados (sin metadatos, precisión de 2 decimales). */
import type { ParadaGradiente } from "../../src/components/brand/colores"
import { formatearNumero, serializar, type Caja, type Trazado } from "./trazado"

export interface Capa {
  readonly trazados: readonly Trazado[]
  /** Color, `currentColor` o `url(#id)`. */
  readonly relleno: string
  readonly opacidad?: number
}

export interface GradienteLineal {
  readonly id: string
  readonly desde: readonly [number, number]
  readonly hasta: readonly [number, number]
  readonly paradas: readonly ParadaGradiente[]
}

export interface DocumentoSvg {
  readonly caja: Caja
  readonly capas: readonly Capa[]
  readonly gradientes?: readonly GradienteLineal[]
  /** Texto accesible (<title>); los SVG decorativos lo omiten. */
  readonly titulo?: string
  /** Rectángulo de fondo opcional (color y radio de esquina). */
  readonly fondo?: { readonly relleno: string; readonly radio: number }
}

const n = formatearNumero

export function gradienteSvg(g: GradienteLineal): string {
  const paradas = g.paradas
    .map((p) => `<stop offset="${n(p.offset)}" stop-color="${p.color}"/>`)
    .join("")
  return (
    `<linearGradient id="${g.id}" x1="${n(g.desde[0])}" y1="${n(g.desde[1])}" ` +
    `x2="${n(g.hasta[0])}" y2="${n(g.hasta[1])}" gradientUnits="userSpaceOnUse">${paradas}</linearGradient>`
  )
}

/** Diagonal ascendente (abajo-izquierda → arriba-derecha) que cubre la caja. */
export function diagonalAscendente(
  caja: Caja
): Pick<GradienteLineal, "desde" | "hasta"> {
  return {
    desde: [caja.x, caja.y + caja.alto],
    hasta: [caja.x + caja.ancho, caja.y],
  }
}

export function capaSvg(capa: Capa): string {
  const d = capa.trazados.map(serializar).join("")
  const opacidad =
    capa.opacidad === undefined ? "" : ` fill-opacity="${n(capa.opacidad)}"`
  return `<path fill="${capa.relleno}"${opacidad} d="${d}"/>`
}

export function documentoSvg(doc: DocumentoSvg): string {
  const { caja } = doc
  const viewBox = [caja.x, caja.y, caja.ancho, caja.alto].map(n).join(" ")
  const titulo = doc.titulo ? `<title>${doc.titulo}</title>` : ""
  const defs = doc.gradientes?.length
    ? `<defs>${doc.gradientes.map(gradienteSvg).join("")}</defs>`
    : ""
  const fondo = doc.fondo
    ? `<rect x="${n(caja.x)}" y="${n(caja.y)}" width="${n(caja.ancho)}" height="${n(caja.alto)}" rx="${n(doc.fondo.radio)}" fill="${doc.fondo.relleno}"/>`
    : ""
  const accesible = doc.titulo ? ' role="img"' : ' aria-hidden="true"'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${accesible}>` +
    titulo +
    defs +
    fondo +
    doc.capas.map(capaSvg).join("") +
    "</svg>\n"
  )
}

/** Amplía la caja por igual en los cuatro lados. */
export function conMargen(caja: Caja, margen: number): Caja {
  return {
    x: caja.x - margen,
    y: caja.y - margen,
    ancho: caja.ancho + 2 * margen,
    alto: caja.alto + 2 * margen,
  }
}
