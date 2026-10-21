/**
 * Patrón de rayas diagonales para "sin datos", generado como píxeles RGBA
 * (sin canvas) para registrarlo con `map.addImage`. Módulo puro.
 */

export interface ImagenRgba {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

function rgba(color: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const n = Number.parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
  }
  const funcional = /^rgba?\(([^)]+)\)$/i.exec(color)
  if (funcional) {
    const [r, g, b, a = "1"] = funcional[1].split(",").map((p) => p.trim())
    return [Number(r), Number(g), Number(b), Math.round(Number(a) * 255)]
  }
  throw new Error(`Color no soportado para el patrón: ${color}`)
}

/**
 * Baldosa cuadrada con rayas a 45° de `grosor` px cada `periodo` px sobre un
 * fondo transparente; se repite sin costuras porque `periodo` divide al lado.
 */
export function crearPatronRayado(
  colorRaya: string,
  { lado = 12, periodo = 6, grosor = 2 } = {}
): ImagenRgba {
  const [r, g, b, a] = rgba(colorRaya)
  const data = new Uint8Array(lado * lado * 4)
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if ((x + y) % periodo < grosor) {
        const i = (y * lado + x) * 4
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = a
      }
    }
  }
  return { width: lado, height: lado, data }
}
