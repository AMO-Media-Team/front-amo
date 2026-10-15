/**
 * Logotipo "amo": contornos de Plus Jakarta Sans ExtraBold (OFL) ajustados a mano.
 *
 * Ajustes sobre la fuente original (todo en unidades de fuente, 1000/em):
 *  1. La "m" se condensa: cada contraforma pierde `REDUCCION_CONTRAFORMA_M`
 *     unidades sin tocar el grosor de las astas. Así las tres letras tienen un
 *     color tipográfico más parejo (la "m" original es muy ancha para "amo").
 *  2. El remate superior de la "a" se corta a 45°, perpendicular al eje de
 *     emisión de los arcos del isotipo (que apuntan arriba a la derecha): un
 *     gesto compartido entre símbolo y palabra, sin cerrar la boca de la "a".
 *  3. Espaciado óptico cerrado, calibrado a mano para tamaño display.
 */
import opentype from "opentype.js"
import { readFileSync } from "node:fs"

import type { Comando, Punto, Trazado } from "./trazado"

export type Fuente = opentype.Font

const iguales = (a: Punto, b: Punto) =>
  Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01

export function cargarFuente(ruta: string): Fuente {
  const datos = readFileSync(ruta)
  return opentype.parse(
    datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength)
  )
}

function glifoPorNombre(fuente: Fuente, nombre: string): opentype.Glyph {
  for (let i = 0; i < fuente.numGlyphs; i++) {
    const glifo = fuente.glyphs.get(i)
    if (glifo.name === nombre) return glifo
  }
  throw new Error(`La fuente no tiene el glifo "${nombre}"`)
}

/** Convierte comandos de opentype (ya en convención SVG, y hacia abajo) a `Trazado`. */
export function desdeOpentype(
  comandos: readonly opentype.PathCommand[]
): Trazado {
  return comandos.map((c): Comando => {
    switch (c.type) {
      case "M":
      case "L":
        return { tipo: c.type, p: [c.x, c.y] }
      case "Q":
        return { tipo: "Q", c: [c.x1, c.y1], p: [c.x, c.y] }
      case "C":
        return { tipo: "C", c1: [c.x1, c.y1], c2: [c.x2, c.y2], p: [c.x, c.y] }
      case "Z":
        return { tipo: "Z" }
    }
  })
}

interface TablaOs2 {
  readonly sxHeight: number
  readonly sCapHeight: number
}

function esTablaOs2(tabla: unknown): tabla is TablaOs2 {
  return (
    typeof tabla === "object" &&
    tabla !== null &&
    "sxHeight" in tabla &&
    "sCapHeight" in tabla
  )
}

/** x-height y altura de mayúsculas (tabla OS/2), en unidades de fuente. */
export function metricas(fuente: Fuente): {
  alturaX: number
  altoMayuscula: number
} {
  const os2: unknown = fuente.tables.os2
  if (!esTablaOs2(os2))
    throw new Error("La fuente no tiene tabla OS/2 con métricas verticales")
  return { alturaX: os2.sxHeight, altoMayuscula: os2.sCapHeight }
}

/** Quita las rectas de longitud cero que opentype emite tras cada curva. */
export function sinSegmentosNulos(trazado: Trazado): Trazado {
  return trazado.filter((c, k) => {
    if (c.tipo !== "L" || k === 0) return true
    const previo = trazado[k - 1]
    return previo.tipo === "Z" || !iguales(previo.p, c.p)
  })
}

/** Contorno del glifo en unidades de fuente, línea base en y = 0 e y hacia abajo. */
function contornoGlifo(fuente: Fuente, nombre: string): Trazado {
  const glifo = glifoPorNombre(fuente, nombre)
  return sinSegmentosNulos(
    desdeOpentype(glifo.getPath(0, 0, fuente.unitsPerEm).commands)
  )
}

/** Aplica una función a la coordenada x de todos los puntos (incluidos los de control). */
function mapearX(trazado: Trazado, f: (x: number) => number): Trazado {
  const m = ([x, y]: Punto): Punto => [f(x), y]
  return trazado.map((c): Comando => {
    switch (c.tipo) {
      case "Z":
      case "A":
        return c
      case "M":
      case "L":
        return { tipo: c.tipo, p: m(c.p) }
      case "Q":
        return { tipo: "Q", c: m(c.c), p: m(c.p) }
      case "C":
        return { tipo: "C", c1: m(c.c1), c2: m(c.c2), p: m(c.p) }
    }
  })
}

/**
 * Mapa lineal por tramos que estrecha las contraformas de la "m" y deja
 * intactas las astas. `astas` son los intervalos [izq, der] de cada asta.
 */
export function condensador(
  astas: readonly (readonly [number, number])[],
  reduccion: number
) {
  return (x: number): number => {
    let desplazamiento = 0
    for (let i = 0; i < astas.length - 1; i++) {
      const finAsta = astas[i][1]
      const inicioSiguiente = astas[i + 1][0]
      if (x <= finAsta) return x - desplazamiento
      if (x < inicioSiguiente) {
        const hueco = inicioSiguiente - finAsta
        return (
          finAsta -
          desplazamiento +
          ((x - finAsta) * (hueco - reduccion)) / hueco
        )
      }
      desplazamiento += reduccion
    }
    return x - desplazamiento
  }
}

// --- Remate de la "a" -------------------------------------------------------

type Cuadratica = readonly [Punto, Punto, Punto]

export function evaluarCuadratica([p0, c, p1]: Cuadratica, t: number): Punto {
  const u = 1 - t
  return [
    u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
    u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
  ]
}

/** Subcurva [0, t] de una cuadrática; con t > 1 la prolonga siguiendo la misma parábola. */
export function recortarCuadratica(curva: Cuadratica, t: number): Cuadratica {
  const [p0, c] = curva
  const control: Punto = [
    p0[0] + (c[0] - p0[0]) * t,
    p0[1] + (c[1] - p0[1]) * t,
  ]
  return [p0, control, evaluarCuadratica(curva, t)]
}

/** Parámetro t en [desde, hasta] donde la curva cruza la recta (punto, dirección). */
function cruceConRecta(
  curva: Cuadratica,
  punto: Punto,
  dir: Punto,
  desde: number,
  hasta: number
): number {
  const lado = (t: number) => {
    const [x, y] = evaluarCuadratica(curva, t)
    return (x - punto[0]) * dir[1] - (y - punto[1]) * dir[0]
  }
  let a = desde
  let b = hasta
  if (Math.sign(lado(a)) === Math.sign(lado(b)))
    throw new Error("La recta no corta la curva")
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2
    if (Math.sign(lado(m)) === Math.sign(lado(a))) a = m
    else b = m
  }
  return (a + b) / 2
}

/**
 * Gira el corte del remate superior de la "a" alrededor de su punto medio.
 * El remate original es la recta `interior → exterior`; la curva interior
 * llega a él y la exterior parte de él. Se prolonga/recorta cada curva hasta
 * la nueva recta de corte.
 */
export function girarRemate(
  trazado: Trazado,
  interior: Punto,
  exterior: Punto,
  anguloGrados: number
): Trazado {
  const i = trazado.findIndex(
    (c, k) =>
      c.tipo === "L" &&
      iguales(c.p, exterior) &&
      k > 0 &&
      iguales(puntoFinal(trazado[k - 1]), interior)
  )
  const curvaEntrada = trazado[i - 1]
  const curvaSalida = trazado[i + 1]
  if (i < 2 || curvaEntrada.tipo !== "Q" || curvaSalida.tipo !== "Q") {
    throw new Error("No se encontró el remate de la 'a' (¿cambió la fuente?)")
  }
  const inicioEntrada = puntoFinal(trazado[i - 2])
  const entrada: Cuadratica = [inicioEntrada, curvaEntrada.c, curvaEntrada.p]
  const salida: Cuadratica = [exterior, curvaSalida.c, curvaSalida.p]

  const pivote: Punto = [
    (interior[0] + exterior[0]) / 2,
    (interior[1] + exterior[1]) / 2,
  ]
  const rad = (anguloGrados * Math.PI) / 180
  // En SVG la y crece hacia abajo: el corte sube hacia la izquierda.
  const dir: Punto = [-Math.cos(rad), -Math.sin(rad)]

  const tEntrada = cruceConRecta(entrada, pivote, dir, 0.5, 1.8)
  const tSalida = cruceConRecta(salida, pivote, dir, 0, 1)
  const nuevaEntrada = recortarCuadratica(entrada, tEntrada)
  // Para la salida se conserva la parte [tSalida, 1]: se invierte, se recorta y se vuelve a invertir.
  const salidaInvertida: Cuadratica = [salida[2], salida[1], salida[0]]
  const recorte = recortarCuadratica(salidaInvertida, 1 - tSalida)

  const resultado = [...trazado]
  resultado[i - 1] = { tipo: "Q", c: nuevaEntrada[1], p: nuevaEntrada[2] }
  resultado[i] = { tipo: "L", p: recorte[2] }
  resultado[i + 1] = { tipo: "Q", c: recorte[1], p: salida[2] }
  return resultado
}

function puntoFinal(c: Comando): Punto {
  if (c.tipo === "Z") throw new Error("Z no tiene punto final")
  return c.p
}

// --- Composición --------------------------------------------------------------

export interface Palabra {
  readonly trazado: Trazado
  readonly ancho: number
  readonly alturaX: number
}

/** Espacio entre la caja de tinta de una letra y la siguiente, en unidades de fuente. */
const ESPACIO_A_M = 62
const ESPACIO_M_O = 44
const REDUCCION_CONTRAFORMA_M = 16
const ANGULO_REMATE = 45

function desplazar(trazado: Trazado, dx: number): Trazado {
  return mapearX(trazado, (x) => x + dx)
}

function limitesX(trazado: Trazado): readonly [number, number] {
  const xs = trazado.flatMap((c) =>
    c.tipo === "Z" || c.tipo === "A" ? [] : [c.p[0]]
  )
  return [Math.min(...xs), Math.max(...xs)]
}

export function construirPalabra(fuente: Fuente): Palabra {
  const a = girarRemate(
    contornoGlifo(fuente, "a"),
    [172, -353],
    [52, -410],
    ANGULO_REMATE
  )
  const m = mapearX(
    contornoGlifo(fuente, "m"),
    condensador(
      [
        [55, 205],
        [395, 545],
        [735, 885],
      ],
      REDUCCION_CONTRAFORMA_M
    )
  )
  const o = contornoGlifo(fuente, "o")

  const [aIzq, aDer] = limitesX(a)
  const [mIzq, mDer] = limitesX(m)
  const [oIzq, oDer] = limitesX(o)
  const colocadaA = desplazar(a, -aIzq)
  const xM = aDer - aIzq + ESPACIO_A_M
  const colocadaM = desplazar(m, xM - mIzq)
  const xO = xM + (mDer - mIzq) + ESPACIO_M_O
  const colocadaO = desplazar(o, xO - oIzq)

  const { alturaX } = metricas(fuente)
  return {
    trazado: [...colocadaA, ...colocadaM, ...colocadaO],
    ancho: xO + (oDer - oIzq),
    alturaX,
  }
}

/**
 * Texto compuesto con kerning (GPOS) y tracking (em), línea base en y = 0.
 * Se maqueta a mano: el motor de opentype.js 2 falla con el `ccmp` de esta
 * fuente y para un descriptor en mayúsculas no hacen falta ligaduras.
 */
export function construirTexto(
  fuente: Fuente,
  texto: string,
  tamano: number,
  tracking: number
): Trazado {
  const escala = tamano / fuente.unitsPerEm
  const glifos = [...texto].map((caracter) => fuente.charToGlyph(caracter))
  let x = 0
  return glifos.flatMap((glifo, i) => {
    const contorno = desdeOpentype(glifo.getPath(x, 0, tamano).commands)
    const siguiente = glifos[i + 1]
    const kerning = siguiente ? fuente.getKerningValue(glifo, siguiente) : 0
    x += ((glifo.advanceWidth ?? 0) + kerning) * escala + tracking * tamano
    return sinSegmentosNulos(contorno)
  })
}
