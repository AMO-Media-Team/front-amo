import { describe, expect, it } from "vitest"

import { codificarIco } from "./ico"

const pngFalso = (bytes: number) => new Uint8Array(bytes).fill(7)

describe("codificarIco", () => {
  it("escribe cabecera, directorio y datos en orden", () => {
    const ico = codificarIco([
      { tamano: 16, png: pngFalso(10) },
      { tamano: 256, png: pngFalso(20) },
    ])

    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)

    // Primera entrada: 16 px, 10 bytes, justo después del directorio (6 + 2·16).
    expect(ico.readUInt8(6)).toBe(16)
    expect(ico.readUInt32LE(6 + 8)).toBe(10)
    expect(ico.readUInt32LE(6 + 12)).toBe(38)

    // 256 px se codifica como 0.
    expect(ico.readUInt8(22)).toBe(0)
    expect(ico.readUInt32LE(22 + 12)).toBe(48)
    expect(ico.byteLength).toBe(68)
  })

  it("rechaza listas vacías y tamaños fuera de rango", () => {
    expect(() => codificarIco([])).toThrow()
    expect(() => codificarIco([{ tamano: 512, png: pngFalso(1) }])).toThrow()
  })
})
