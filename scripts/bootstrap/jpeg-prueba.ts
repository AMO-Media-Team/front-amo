/**
 * JPEG de muestra (módulo puro): JFIF baseline YCbCr 4:4:4 construido sin
 * dependencias, con la misma muestra que `pngDeMuestra` (franja en el 20 %
 * superior sobre un fondo). Cada bloque de 8 × 8 es de un solo color, así que
 * la transformada solo deja el coeficiente DC: se codifica la diferencia de
 * DC y un fin de bloque, sin DCT ni tablas Huffman completas. Con
 * `bytesMinimos` agrega comentarios (COM) hasta alcanzar ese peso, para probar
 * archivos grandes sin cambiar la imagen.
 */
import type { ColorRgb } from "./archivos-prueba"
import { EscritorBits } from "./escritor-bits"

const LADO_BLOQUE = 8
/** Un comentario JPEG lleva hasta 65 533 bytes (el largo de 16 bits incluye sus 2 bytes). */
const MAXIMO_COMENTARIO = 0xffff - 2
const COMPONENTES = 3

/** Tabla DC de luminancia del estándar (ITU-T T.81, Anexo K.3): categorías 0 a 11. */
const DC_CONTEOS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
const DC_SIMBOLOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
/** Tabla AC mínima: fin de bloque (0x00) y la serie de 16 ceros (0xF0, sin uso). */
const AC_CONTEOS = [0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const AC_SIMBOLOS = [0x00, 0xf0]
const FIN_DE_BLOQUE = 0x00

export class ErrorJpegPrueba extends RangeError {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorJpegPrueba"
  }
}

interface Codigo {
  codigo: number
  largo: number
}

/** Códigos canónicos de una tabla Huffman (T.81 §C.2) por símbolo. */
export function codigosHuffman(
  conteos: readonly number[],
  simbolos: readonly number[]
): Map<number, Codigo> {
  const codigos = new Map<number, Codigo>()
  let codigo = 0
  let indice = 0
  conteos.forEach((cantidad, posicion) => {
    for (let i = 0; i < cantidad; i += 1) {
      codigos.set(simbolos[indice++], { codigo: codigo++, largo: posicion + 1 })
    }
    codigo <<= 1
  })
  return codigos
}

const CODIGOS_DC = codigosHuffman(DC_CONTEOS, DC_SIMBOLOS)
const CODIGOS_AC = codigosHuffman(AC_CONTEOS, AC_SIMBOLOS)

/** Bits que ocupa la magnitud de `valor` (la «categoría» de T.81 §F.1.2.1). */
export function categoria(valor: number): number {
  const magnitud = Math.abs(valor)
  return magnitud === 0 ? 0 : Math.floor(Math.log2(magnitud)) + 1
}

/** RGB → YCbCr JFIF (rango completo, 0–255). */
export function yCbCrJfif([rojo, verde, azul]: ColorRgb): [
  y: number,
  cb: number,
  cr: number,
] {
  return [
    0.299 * rojo + 0.587 * verde + 0.114 * azul,
    128 - 0.168736 * rojo - 0.331264 * verde + 0.5 * azul,
    128 + 0.5 * rojo - 0.418688 * verde - 0.081312 * azul,
  ]
}

/**
 * DC de un bloque de un solo color con la tabla de cuantización en 1: la
 * transformada de un bloque constante `s` (ya desplazado −128) es `8·s`.
 */
export function dcDeBloque(muestra: number): number {
  return Math.round(8 * (muestra - 128))
}

function segmento(marcador: number, ...contenido: Buffer[]): Buffer {
  const cuerpo = Buffer.concat(contenido)
  const cabecera = Buffer.alloc(4)
  cabecera.writeUInt16BE(0xff00 | marcador, 0)
  cabecera.writeUInt16BE(cuerpo.length + 2, 2)
  return Buffer.concat([cabecera, cuerpo])
}

function u16(valor: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(valor)
  return b
}

/** Comentarios COM de relleno que suman `bytes` (cada uno con 4 de cabecera). */
function comentariosDeRelleno(bytes: number): Buffer[] {
  const segmentos: Buffer[] = []
  let faltan = bytes
  const texto = Buffer.from(
    "AMO · archivo de prueba E2E (relleno para alcanzar el peso pedido). ",
    "utf8"
  )
  while (faltan > 0) {
    // Un comentario necesita al menos 4 bytes (marcador y largo).
    const total = Math.min(Math.max(faltan, 4), MAXIMO_COMENTARIO + 4)
    const contenido = Buffer.alloc(total - 4)
    for (let i = 0; i < contenido.length; i += texto.length) {
      texto.copy(contenido, i, 0, Math.min(texto.length, contenido.length - i))
    }
    segmentos.push(segmento(0xfe, contenido))
    faltan -= total
  }
  return segmentos
}

export interface OpcionesJpeg {
  ancho: number
  alto: number
  fondo: ColorRgb
  franja: ColorRgb
  /** Peso mínimo del archivo; se completa con comentarios. */
  bytesMinimos?: number
}

/**
 * JPEG de `ancho` × `alto`. La franja cubre las filas de bloques que empiezan
 * dentro del 20 % superior (su borde cae en un múltiplo de 8).
 */
export function jpegDeMuestra(opciones: OpcionesJpeg): Buffer {
  const { ancho, alto } = opciones
  for (const valor of [ancho, alto]) {
    if (!Number.isInteger(valor) || valor < 1 || valor > 0xffff) {
      throw new ErrorJpegPrueba(
        "El JPEG necesita un ancho y un alto enteros entre 1 y 65 535."
      )
    }
  }
  const bloquesAncho = Math.ceil(ancho / LADO_BLOQUE)
  const bloquesAlto = Math.ceil(alto / LADO_BLOQUE)
  const altoFranja = Math.ceil(alto * 0.2)
  const dcFondo = yCbCrJfif(opciones.fondo).map(dcDeBloque)
  const dcFranja = yCbCrJfif(opciones.franja).map(dcDeBloque)

  // El código Huffman se escribe con relleno de bytes: tras cada 0xFF, un 0x00.
  const datos = new EscritorBits((byte) => (byte === 0xff ? [0xff, 0] : [byte]))
  const previo = [0, 0, 0]
  const escribir = (simbolo: Codigo | undefined) => {
    if (!simbolo) throw new ErrorJpegPrueba("Símbolo sin código Huffman.")
    datos.bits(simbolo.codigo, simbolo.largo)
  }
  for (let fila = 0; fila < bloquesAlto; fila += 1) {
    const dc = fila * LADO_BLOQUE < altoFranja ? dcFranja : dcFondo
    for (let columna = 0; columna < bloquesAncho; columna += 1) {
      for (let c = 0; c < COMPONENTES; c += 1) {
        const diferencia = dc[c] - previo[c]
        previo[c] = dc[c]
        const bits = categoria(diferencia)
        escribir(CODIGOS_DC.get(bits))
        // Negativos: complemento a uno en `bits` bits (T.81 §F.1.2.1.1).
        if (bits > 0) {
          datos.bits(
            diferencia > 0 ? diferencia : diferencia + 2 ** bits - 1,
            bits
          )
        }
        escribir(CODIGOS_AC.get(FIN_DE_BLOQUE))
      }
    }
  }
  const entropia = datos.alinear(1).aBuffer()

  const cabecera = [
    Buffer.of(0xff, 0xd8), // SOI
    segmento(
      0xe0, // APP0 JFIF 1.01, sin miniatura
      Buffer.from("JFIF\0", "ascii"),
      Buffer.of(1, 1, 0),
      u16(1),
      u16(1),
      Buffer.of(0, 0)
    ),
    segmento(0xdb, Buffer.of(0x00), Buffer.alloc(64, 1)), // DQT 0: todo en 1
    segmento(
      0xc0, // SOF0: 8 bits, tres componentes 1×1 con la tabla 0
      Buffer.of(8),
      u16(alto),
      u16(ancho),
      Buffer.of(COMPONENTES, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0)
    ),
    segmento(
      0xc4, // DHT: DC 0 y AC 0
      Buffer.of(0x00, ...DC_CONTEOS, ...DC_SIMBOLOS),
      Buffer.of(0x10, ...AC_CONTEOS, ...AC_SIMBOLOS)
    ),
  ]
  const exploracion = segmento(
    0xda, // SOS: los tres componentes con las tablas 0, espectro completo
    Buffer.of(COMPONENTES, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0)
  )
  const fin = Buffer.of(0xff, 0xd9) // EOI
  const largoBase =
    cabecera.reduce((total, parte) => total + parte.length, 0) +
    exploracion.length +
    entropia.length +
    fin.length
  const relleno = comentariosDeRelleno(
    Math.max(0, (opciones.bytesMinimos ?? 0) - largoBase)
  )
  return Buffer.concat([...cabecera, ...relleno, exploracion, entropia, fin])
}
