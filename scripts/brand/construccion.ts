/**
 * Diagrama de construcción del isotipo (para docs/marca.md): cabeza y flancos
 * tangentes, la Λ inscrita con margen constante, el ritmo del módulo en los
 * arcos y el eje de emisión a 45°.
 */
import { AURORA, LILA, NEUTRO } from "../../src/components/brand/colores"
import {
  geometriaA,
  radiosArcos,
  semianguloPunta,
  tangenciaDerecha,
  type ParametrosIsotipo,
  type PiezasIsotipo,
} from "./isotipo"
import { conMargen, diagonalAscendente, gradienteSvg } from "./svg"
import { formatearNumero as n, serializar, type Punto } from "./trazado"

const LINEA = LILA[300]
const ACENTO = "#C77DFF"
const RAD = Math.PI / 180

function linea(
  [x1, y1]: Punto,
  [x2, y2]: Punto,
  color: string = LINEA,
  discontinua = true
) {
  const trazo = discontinua ? ' stroke-dasharray="1 .8"' : ""
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width=".22"${trazo}/>`
}

function circulo(r: number, opacidad = 0.7) {
  return `<circle r="${n(r)}" fill="none" stroke="${LINEA}" stroke-opacity="${opacidad}" stroke-width=".2" stroke-dasharray="1 .8"/>`
}

function punto([x, y]: Punto, color: string = LINEA) {
  return `<circle cx="${n(x)}" cy="${n(y)}" r=".7" fill="${color}"/>`
}

function rotulo(x: number, y: number, texto: string, color: string = LINEA) {
  return `<text x="${n(x)}" y="${n(y)}" fill="${color}" font-size="2.4" font-family="system-ui,sans-serif">${texto}</text>`
}

const polar = (r: number, grados: number): Punto => [
  r * Math.cos(grados * RAD),
  r * Math.sin(grados * RAD),
]

/**
 * Paralela al flanco derecho desplazada `d` hacia el interior, desde la altura
 * de la tangencia hasta el eje (donde se cruza con su simétrica).
 */
function flancoInterior(p: ParametrosIsotipo, d: number): [Punto, Punto] {
  const theta = semianguloPunta(p)
  const normal: Punto = [-Math.cos(theta), -Math.sin(theta)]
  const [tx, ty] = tangenciaDerecha(p)
  const desde: Punto = [tx + normal[0] * d, ty + normal[1] * d]
  const hasta: Punto = [0, p.distanciaPunta - d / Math.sin(theta)]
  return [desde, hasta]
}

export function svgConstruccion(
  piezas: PiezasIsotipo,
  p: ParametrosIsotipo
): string {
  const base = conMargen(piezas.caja, 12)
  // Lienzo cuadrado centrado en la caja del isotipo.
  const lado = Math.max(base.ancho, base.alto)
  const caja = {
    x: base.x - (lado - base.ancho) / 2,
    y: base.y - (lado - base.alto) / 2,
    ancho: lado,
    alto: lado,
  }
  const theta = semianguloPunta(p)
  const tangente = tangenciaDerecha(p)
  const espejo = ([x, y]: Punto): Punto => [-x, y]
  const D = p.distanciaPunta
  const a = geometriaA(p)
  const phi = p.anguloA * RAD
  // Eje de cada pata de la Λ: pasa por el centro del pie con el ángulo φ.
  const ejePata = (pie: Punto, signo: 1 | -1): [Punto, Punto] => {
    const largo = 40
    return [
      [pie[0] - signo * Math.sin(phi) * largo, pie[1] - Math.cos(phi) * largo],
      [pie[0] + signo * Math.sin(phi) * 6, pie[1] + Math.cos(phi) * 6],
    ]
  }
  const radiosRitmo = radiosArcos(p).flatMap((r) => [r, r + p.grosorArco])
  const exterior = radiosRitmo[radiosRitmo.length - 1] ?? p.radio
  const inicio = p.ejeArcos - p.aperturaArcos / 2
  const fin = p.ejeArcos + p.aperturaArcos / 2
  // Prolongación de los flancos más allá de la tangencia.
  const alcance = 70
  const flancoX = Math.tan(theta) * alcance
  const grad = {
    id: "amo-construccion",
    paradas: AURORA,
    ...diagonalAscendente(piezas.caja),
  }
  const d = [piezas.pin, ...piezas.arcos].map(serializar).join("")
  const [interiorDesde, interiorHasta] = flancoInterior(p, p.margenA)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[caja.x, caja.y, caja.ancho, caja.alto].map(n).join(" ")}">` +
    `<defs>${gradienteSvg(grad)}</defs>` +
    `<rect x="${n(caja.x)}" y="${n(caja.y)}" width="${n(caja.ancho)}" height="${n(caja.alto)}" fill="${NEUTRO.fondoOscuro}"/>` +
    `<path d="${d}" fill="url(#amo-construccion)" fill-opacity=".85"/>` +
    // Cabeza, ritmo de los arcos y margen de la Λ.
    circulo(p.radio, 1) +
    radiosRitmo.map((r) => circulo(r, 0.35)).join("") +
    circulo(p.radio - p.margenA, 0.9) +
    linea(interiorDesde, interiorHasta, ACENTO) +
    linea(espejo(interiorDesde), espejo(interiorHasta), ACENTO) +
    // Eje vertical, flancos tangentes y línea de tangencia.
    linea([0, caja.y], [0, caja.y + caja.alto]) +
    linea([0, D], [-flancoX, D - alcance]) +
    linea([0, D], [flancoX, D - alcance]) +
    linea([caja.x, tangente[1]], [caja.x + caja.ancho, tangente[1]], LINEA) +
    punto(tangente) +
    punto(espejo(tangente)) +
    // Ejes de las patas de la Λ.
    linea(...ejePata(a.pieDerecho, 1), ACENTO, false) +
    linea(...ejePata(espejo(a.pieDerecho), -1), ACENTO, false) +
    punto(a.pieDerecho, ACENTO) +
    punto(espejo(a.pieDerecho), ACENTO) +
    // Radios que cortan los arcos y eje de emisión.
    linea([0, 0], polar(exterior + 6, inicio)) +
    linea([0, 0], polar(exterior + 6, fin)) +
    linea([0, 0], polar(exterior + 10, p.ejeArcos), ACENTO, false) +
    rotulo(-p.radio - 11, -2, `R = ${p.radio}`) +
    rotulo(3, D + 5, `D = ${D}`) +
    rotulo(caja.x + 3, tangente[1] - 1.2, "línea de tangencia", LINEA) +
    rotulo(
      polar(exterior + 11, p.ejeArcos)[0] - 2,
      polar(exterior + 11, p.ejeArcos)[1] - 1,
      `eje ${-p.ejeArcos}°`,
      ACENTO
    ) +
    rotulo(p.radio - 2, 28, `módulo m = ${p.trazoA}`) +
    rotulo(p.radio - 2, 31.5, "trazo Λ = arco = hueco") +
    rotulo(p.radio - 2, 35, `margen Λ = ${p.margenA} (m/2)`, ACENTO) +
    rotulo(
      p.radio - 2,
      38.5,
      `φ = ${p.anguloA}° · θ = ${Math.round(theta / RAD)}°`,
      ACENTO
    ) +
    rotulo(
      caja.x + 3,
      caja.y + 6,
      "— la Λ se inscribe con margen m/2 en la cabeza y en ambos flancos",
      ACENTO
    ) +
    "</svg>\n"
  )
}
