/**
 * Composición de las versiones del logo (horizontal y vertical, con y sin
 * descriptor). Unidades: las de la fuente (x-height de "amo" = 546), con la
 * línea base de la palabra en y = 0.
 */
import type { PiezasIsotipo } from "./isotipo"
import { construirTexto, metricas, type Fuente, type Palabra } from "./logotipo"
import {
  cajaDe,
  centroide,
  transformar,
  type Caja,
  type Punto,
  type Trazado,
  type Transformacion,
} from "./trazado"

export interface IsotipoColocado {
  readonly pin: Trazado
  readonly arcos: readonly Trazado[]
  readonly caja: Caja
}

export interface Lockup {
  readonly caja: Caja
  readonly isotipo: IsotipoColocado
  readonly palabra: Trazado
  readonly descriptor?: Trazado
  readonly separador?: Trazado
}

export const DESCRIPTOR = ["Advertising", "Market", "Optimization"] as const

/** Proporciones del sistema, relativas a la x-height de la palabra. */
const PROPORCION = {
  /** Alto del isotipo en la versión horizontal. */
  isotipoHorizontal: 1.9,
  /** Espacio entre isotipo y palabra (horizontal). */
  espacioHorizontal: 0.3,
  /** Alto del isotipo en la versión vertical. */
  isotipoVertical: 2.7,
  espacioVertical: 0.5,
  /** Hueco entre palabra y separador, y entre separador y descriptor. */
  espacioSeparador: 0.34,
  grosorSeparador: 0.028,
  /** Tracking del descriptor en em. */
  tracking: 0.16,
  interlineaDescriptor: 1.62,
  espacioDescriptorVertical: 0.42,
} as const

export function colocarIsotipo(
  piezas: PiezasIsotipo,
  t: Transformacion
): IsotipoColocado {
  const pin = transformar(piezas.pin, t)
  const arcos = piezas.arcos.map((a) => transformar(a, t))
  return { pin, arcos, caja: cajaDe(pin, ...arcos) }
}

/**
 * Centro óptico del isotipo: punto medio entre el centro de su caja y su
 * centroide de área. Centrar solo la caja lo deja cargado a la izquierda (el
 * pin pesa más que los arcos); centrar solo el centroide lo empuja demasiado.
 */
export function centroOptico(piezas: PiezasIsotipo): Punto {
  const [cx, cy] = centroide(piezas.pin, ...piezas.arcos)
  const { x, y, ancho, alto } = piezas.caja
  return [(cx + x + ancho / 2) / 2, (cy + y + alto / 2) / 2]
}

/** Escala y traslación que llevan la caja del isotipo a (x, y) con el alto pedido. */
function ajustar(
  piezas: PiezasIsotipo,
  alto: number,
  x: number,
  y: number
): Transformacion {
  const escala = alto / piezas.caja.alto
  return {
    escala,
    dx: x - piezas.caja.x * escala,
    dy: y - piezas.caja.y * escala,
  }
}

const unir = (...cajas: Caja[]): Caja => {
  const x = Math.min(...cajas.map((c) => c.x))
  const y = Math.min(...cajas.map((c) => c.y))
  const derecha = Math.max(...cajas.map((c) => c.x + c.ancho))
  const abajo = Math.max(...cajas.map((c) => c.y + c.alto))
  return { x, y, ancho: derecha - x, alto: abajo - y }
}

function trasladar(trazado: Trazado, dx: number, dy: number): Trazado {
  return transformar(trazado, { escala: 1, dx, dy })
}

/**
 * Descriptor en tres líneas apiladas y alineadas a la izquierda; el bloque mide
 * exactamente la x-height de la palabra para que ambos compartan línea base y altura.
 */
function descriptorApilado(
  fuente: Fuente,
  alturaX: number,
  x: number
): Trazado {
  const lineas = DESCRIPTOR.map((texto) =>
    construirTexto(fuente, texto.toUpperCase(), 1000, PROPORCION.tracking)
  )
  const { altoMayuscula } = metricas(fuente)
  // n líneas de alto `h` con interlínea `k·h` ocupan h·(1 + (n-1)·k) = alturaX.
  const k = PROPORCION.interlineaDescriptor
  const h = alturaX / (1 + (lineas.length - 1) * k)
  const escala = h / altoMayuscula
  return lineas.flatMap((linea, i) => {
    const caja = cajaDe(linea)
    const lineaBase = -alturaX + h + i * h * k
    return transformar(linea, {
      escala,
      dx: x - caja.x * escala,
      dy: lineaBase,
    })
  })
}

function rectangulo(
  x: number,
  y: number,
  ancho: number,
  alto: number
): Trazado {
  return [
    { tipo: "M", p: [x, y] },
    { tipo: "L", p: [x + ancho, y] },
    { tipo: "L", p: [x + ancho, y + alto] },
    { tipo: "L", p: [x, y + alto] },
    { tipo: "Z" },
  ]
}

export function lockupHorizontal(
  piezas: PiezasIsotipo,
  palabra: Palabra,
  fuente: Fuente,
  conDescriptor: boolean
): Lockup {
  const altoIsotipo = palabra.alturaX * PROPORCION.isotipoHorizontal
  // La punta del pin se apoya en la línea base, con el mismo sobrepaso que la "o".
  const sobrepaso = 12
  const isotipo = colocarIsotipo(
    piezas,
    ajustar(piezas, altoIsotipo, 0, sobrepaso - altoIsotipo)
  )
  const xPalabra =
    isotipo.caja.ancho + palabra.alturaX * PROPORCION.espacioHorizontal
  const trazadoPalabra = trasladar(palabra.trazado, xPalabra, 0)
  const cajaPalabra = cajaDe(trazadoPalabra)

  if (!conDescriptor) {
    return {
      caja: unir(isotipo.caja, cajaPalabra),
      isotipo,
      palabra: trazadoPalabra,
    }
  }
  const espacio = palabra.alturaX * PROPORCION.espacioSeparador
  const grosor = palabra.alturaX * PROPORCION.grosorSeparador
  const xSeparador = cajaPalabra.x + cajaPalabra.ancho + espacio
  const separador = rectangulo(
    xSeparador,
    -palabra.alturaX,
    grosor,
    palabra.alturaX
  )
  const descriptor = descriptorApilado(
    fuente,
    palabra.alturaX,
    xSeparador + grosor + espacio
  )
  return {
    caja: unir(isotipo.caja, cajaPalabra, cajaDe(descriptor)),
    isotipo,
    palabra: trazadoPalabra,
    separador,
    descriptor,
  }
}

/** Descriptor en una sola línea, centrado y con el ancho indicado. */
function descriptorEnLinea(
  fuente: Fuente,
  ancho: number,
  centroX: number,
  lineaBase: number
): Trazado {
  const linea = construirTexto(
    fuente,
    DESCRIPTOR.join(" ").toUpperCase(),
    1000,
    PROPORCION.tracking
  )
  const caja = cajaDe(linea)
  const escala = ancho / caja.ancho
  return transformar(linea, {
    escala,
    dx: centroX - (caja.x + caja.ancho / 2) * escala,
    dy: lineaBase,
  })
}

export function lockupVertical(
  piezas: PiezasIsotipo,
  palabra: Palabra,
  fuente: Fuente,
  conDescriptor: boolean
): Lockup {
  const cajaPalabra = cajaDe(palabra.trazado)
  const centroX = cajaPalabra.x + cajaPalabra.ancho / 2
  const altoIsotipo = palabra.alturaX * PROPORCION.isotipoVertical
  const escala = altoIsotipo / piezas.caja.alto
  const xIsotipo = centroX - centroOptico(piezas)[0] * escala
  const yIsotipo =
    cajaPalabra.y - palabra.alturaX * PROPORCION.espacioVertical - altoIsotipo
  const isotipo = colocarIsotipo(piezas, {
    escala,
    dx: xIsotipo,
    dy: yIsotipo - piezas.caja.y * escala,
  })

  if (!conDescriptor) {
    return {
      caja: unir(isotipo.caja, cajaPalabra),
      isotipo,
      palabra: palabra.trazado,
    }
  }
  const lineaBase =
    cajaPalabra.y +
    cajaPalabra.alto +
    palabra.alturaX * PROPORCION.espacioDescriptorVertical
  const descriptor = descriptorEnLinea(
    fuente,
    cajaPalabra.ancho * 1.5,
    centroX,
    lineaBase + palabra.alturaX * 0.16
  )
  return {
    caja: unir(isotipo.caja, cajaPalabra, cajaDe(descriptor)),
    isotipo,
    palabra: palabra.trazado,
    descriptor,
  }
}
