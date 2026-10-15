/**
 * Construcción geométrica del isotipo de AMO.
 *
 * Idea: un pin de ubicación (lo hiperlocal) de una sola pieza cuya contraforma
 * es una "Λ": la A de AMO y, a la vez, una flecha ascendente (optimización).
 * Sobre la cabeza, dos arcos concéntricos de emisión (medios, alcance) dibujados
 * con el mismo trazo que la Λ: la A calada en el pin y la señal que sale de él
 * son el mismo gesto, en negativo y en positivo.
 *
 * Todo se mide con un módulo `m`: ancho del trazo de la Λ, grosor de cada arco
 * y separación entre cabeza y arcos. La Λ se inscribe en el pin con un margen
 * constante de m/2 respecto a la cabeza y a los dos flancos.
 *
 * Coordenadas: centro de la cabeza en (0, 0), y hacia abajo (convención SVG).
 * Ángulos en grados: 0 = derecha, positivo = sentido horario.
 */
import { cajaDe, type Caja, type Punto, type Trazado } from "./trazado"

export interface ParametrosIsotipo {
  /** Radio de la cabeza del pin. */
  readonly radio: number
  /** Distancia del centro de la cabeza a la punta (vértice sin redondear). */
  readonly distanciaPunta: number
  /** Redondeo de la punta inferior. */
  readonly radioPunta: number
  /** Ancho del trazo de la Λ calada (perpendicular a sus patas). */
  readonly trazoA: number
  /** Semiángulo de la Λ respecto a la vertical, en grados. */
  readonly anguloA: number
  /**
   * Margen de la Λ: material entre su vértice y el borde superior de la cabeza,
   * y entre cada pie y su flanco. Un solo valor: la Λ queda inscrita en el pin.
   */
  readonly margenA: number
  /** Separación entre la cabeza y el primer arco, y entre arcos. */
  readonly hueco: number
  /** Grosor de cada arco de emisión. */
  readonly grosorArco: number
  /** Número de arcos de emisión. */
  readonly arcos: 0 | 1 | 2
  /** Dirección de emisión (bisectriz de los arcos), en grados. */
  readonly ejeArcos: number
  /** Apertura angular de los arcos (entre los centros de sus remates), en grados. */
  readonly aperturaArcos: number
}

export interface PiezasIsotipo {
  /** Silueta del pin con la Λ calada (subtrazado con giro contrario: regla nonzero). */
  readonly pin: Trazado
  readonly arcos: readonly Trazado[]
  readonly caja: Caja
  /** Contorno exterior del pin (cabeza + punta), útil para animaciones de trazo. */
  readonly contornoPin: Trazado
}

const RAD = Math.PI / 180

const polar = (radio: number, grados: number): Punto => [
  radio * Math.cos(grados * RAD),
  radio * Math.sin(grados * RAD),
]

const espejo = (p: Punto): Punto => [-p[0], p[1]]

/** Semiángulo de la punta: los flancos son tangentes a la cabeza. */
export function semianguloPunta({
  radio,
  distanciaPunta,
}: ParametrosIsotipo): number {
  if (distanciaPunta <= radio)
    throw new Error("La punta debe quedar fuera de la cabeza")
  return Math.asin(radio / distanciaPunta)
}

/** Punto de tangencia del flanco derecho con la cabeza (el izquierdo es su espejo). */
export function tangenciaDerecha(p: ParametrosIsotipo): Punto {
  const y = (p.radio * p.radio) / p.distanciaPunta
  return [Math.sqrt(p.radio * p.radio - y * y), y]
}

/** Silueta exterior: arco mayor de la cabeza, flanco derecho, punta redondeada y flanco izquierdo. */
function construirContornoPin(p: ParametrosIsotipo): Trazado {
  const theta = semianguloPunta(p)
  const tangente = tangenciaDerecha(p)
  // El empalme de la punta es tangente a ambos flancos (ángulo interior 2θ).
  const retroceso = p.radioPunta / Math.tan(theta)
  const flanco: Punto = [Math.sin(theta), Math.cos(theta)]
  const entrada: Punto = [
    retroceso * flanco[0],
    p.distanciaPunta - retroceso * flanco[1],
  ]
  return [
    { tipo: "M", p: espejo(tangente) },
    { tipo: "A", radio: p.radio, arcoGrande: true, horario: true, p: tangente },
    { tipo: "L", p: entrada },
    {
      tipo: "A",
      radio: p.radioPunta,
      arcoGrande: false,
      horario: true,
      p: espejo(entrada),
    },
    { tipo: "Z" },
  ]
}

export interface GeometriaA {
  /** Vértice exterior (el más alto) de la contraforma. */
  readonly verticeExterior: Punto
  /** Vértice interior (entre las patas). */
  readonly verticeInterior: Punto
  /** Centro del remate redondo del pie derecho (el izquierdo es su espejo). */
  readonly pieDerecho: Punto
}

/**
 * Geometría de la Λ, inscrita en el pin con margen constante: el vértice
 * exterior queda a `margenA` del borde superior y cada pie redondo, a
 * `margenA` de su flanco.
 */
export function geometriaA(p: ParametrosIsotipo): GeometriaA {
  const theta = semianguloPunta(p)
  const phi = p.anguloA * RAD
  const semitrazo = p.trazoA / 2
  const yExterior = -p.radio + p.margenA
  // Las aristas exterior e interior de cada pata distan `semitrazo` de su eje.
  const yEje = yExterior + semitrazo / Math.sin(phi)
  // Flanco derecho: x·cos θ + y·sin θ = R. El centro del pie, (t·sin φ, yEje + t·cos φ),
  // debe quedar a margen + semitrazo de esa recta.
  const t =
    (p.radio - yEje * Math.sin(theta) - p.margenA - semitrazo) /
    Math.sin(phi + theta)
  if (t <= 0) throw new Error("La Λ no cabe en el pin con ese margen")
  return {
    verticeExterior: [0, yExterior],
    verticeInterior: [0, yEje + semitrazo / Math.sin(phi)],
    pieDerecho: [t * Math.sin(phi), yEje + t * Math.cos(phi)],
  }
}

/**
 * Contraforma Λ recorrida en sentido antihorario (al revés que la silueta),
 * de modo que con la regla nonzero queda calada dentro del pin.
 */
function construirContraformaA(p: ParametrosIsotipo): Trazado {
  const phi = p.anguloA * RAD
  const semitrazo = p.trazoA / 2
  const { verticeExterior, verticeInterior, pieDerecho } = geometriaA(p)
  // Normal exterior de la pata derecha (hacia fuera y arriba).
  const normal: Punto = [Math.cos(phi) * semitrazo, -Math.sin(phi) * semitrazo]
  const exteriorDerecho: Punto = [
    pieDerecho[0] + normal[0],
    pieDerecho[1] + normal[1],
  ]
  const interiorDerecho: Punto = [
    pieDerecho[0] - normal[0],
    pieDerecho[1] - normal[1],
  ]
  const remate = (p: Punto) =>
    ({
      tipo: "A",
      radio: semitrazo,
      arcoGrande: false,
      horario: false,
      p,
    }) as const
  return [
    { tipo: "M", p: verticeExterior },
    { tipo: "L", p: espejo(exteriorDerecho) },
    remate(espejo(interiorDerecho)),
    { tipo: "L", p: verticeInterior },
    { tipo: "L", p: interiorDerecho },
    remate(exteriorDerecho),
    { tipo: "Z" },
  ]
}

/** Sector anular con remates redondos (el arco de emisión), en sentido horario. */
export function arcoRedondeado(
  radioInterior: number,
  radioExterior: number,
  inicio: number,
  fin: number
): Trazado {
  const remate = (radioExterior - radioInterior) / 2
  const grande = Math.abs(fin - inicio) > 180
  return [
    { tipo: "M", p: polar(radioExterior, inicio) },
    {
      tipo: "A",
      radio: radioExterior,
      arcoGrande: grande,
      horario: true,
      p: polar(radioExterior, fin),
    },
    {
      tipo: "A",
      radio: remate,
      arcoGrande: false,
      horario: true,
      p: polar(radioInterior, fin),
    },
    {
      tipo: "A",
      radio: radioInterior,
      arcoGrande: grande,
      horario: false,
      p: polar(radioInterior, inicio),
    },
    {
      tipo: "A",
      radio: remate,
      arcoGrande: false,
      horario: true,
      p: polar(radioExterior, inicio),
    },
    { tipo: "Z" },
  ]
}

/** Radios interiores de cada arco: cabeza, hueco, arco, hueco, arco… */
export function radiosArcos(p: ParametrosIsotipo): number[] {
  return Array.from(
    { length: p.arcos },
    (_, i) => p.radio + p.hueco + i * (p.hueco + p.grosorArco)
  )
}

function construirArcos(p: ParametrosIsotipo): Trazado[] {
  const inicio = p.ejeArcos - p.aperturaArcos / 2
  const fin = p.ejeArcos + p.aperturaArcos / 2
  return radiosArcos(p).map((interior) =>
    arcoRedondeado(interior, interior + p.grosorArco, inicio, fin)
  )
}

export function construirIsotipo(p: ParametrosIsotipo): PiezasIsotipo {
  const contornoPin = construirContornoPin(p)
  const pin = [...contornoPin, ...construirContraformaA(p)]
  const arcos = construirArcos(p)
  return { pin, arcos, caja: cajaDe(contornoPin, ...arcos), contornoPin }
}

/** Isotipo principal (≥ 32 px): pin con la Λ calada y dos arcos. Módulo m = 5. */
export const ISOTIPO_PRINCIPAL: ParametrosIsotipo = {
  radio: 20,
  distanciaPunta: 44,
  radioPunta: 2.5,
  trazoA: 5,
  anguloA: 22,
  margenA: 2.5,
  hueco: 5,
  grosorArco: 5,
  arcos: 2,
  ejeArcos: -45,
  aperturaArcos: 50,
}

/**
 * Versión compacta para 16–24 px: un solo arco, módulo 7 y una Λ más abierta
 * para que la contraforma no se cierre al rasterizar.
 */
export const ISOTIPO_COMPACTO: ParametrosIsotipo = {
  radio: 20,
  distanciaPunta: 42,
  radioPunta: 3,
  trazoA: 7,
  anguloA: 24,
  margenA: 3.5,
  hueco: 7,
  grosorArco: 7,
  arcos: 1,
  ejeArcos: -45,
  aperturaArcos: 54,
}
