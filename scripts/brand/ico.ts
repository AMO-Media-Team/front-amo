/**
 * Codificador ICO con imágenes PNG embebidas (formato admitido por todos los
 * navegadores actuales). Evita depender de herramientas externas.
 */

export interface ImagenIco {
  /** Lado en píxeles (1–256). */
  readonly tamano: number
  readonly png: Uint8Array
}

const CABECERA = 6
const ENTRADA = 16

export function codificarIco(imagenes: readonly ImagenIco[]): Buffer {
  if (imagenes.length === 0)
    throw new Error("Un ICO necesita al menos una imagen")
  const cabecera = Buffer.alloc(CABECERA)
  cabecera.writeUInt16LE(0, 0) // reservado
  cabecera.writeUInt16LE(1, 2) // tipo: icono
  cabecera.writeUInt16LE(imagenes.length, 4)

  let desplazamiento = CABECERA + ENTRADA * imagenes.length
  const entradas = imagenes.map(({ tamano, png }) => {
    if (tamano < 1 || tamano > 256)
      throw new Error(`Tamaño ICO inválido: ${tamano}`)
    const entrada = Buffer.alloc(ENTRADA)
    const lado = tamano === 256 ? 0 : tamano // 0 significa 256
    entrada.writeUInt8(lado, 0)
    entrada.writeUInt8(lado, 1)
    entrada.writeUInt8(0, 2) // paleta
    entrada.writeUInt8(0, 3) // reservado
    entrada.writeUInt16LE(1, 4) // planos
    entrada.writeUInt16LE(32, 6) // bits por píxel
    entrada.writeUInt32LE(png.byteLength, 8)
    entrada.writeUInt32LE(desplazamiento, 12)
    desplazamiento += png.byteLength
    return entrada
  })

  return Buffer.concat([
    cabecera,
    ...entradas,
    ...imagenes.map((i) => Buffer.from(i.png)),
  ])
}
