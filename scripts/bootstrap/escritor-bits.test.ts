// @vitest-environment node
import { describe, expect, it } from "vitest"

import { EscritorBits } from "./escritor-bits"

const bin = (buffer: Buffer) =>
  [...buffer].map((byte) => byte.toString(2).padStart(8, "0")).join("")

describe("EscritorBits", () => {
  it("escribe bits y grupos de bits del más al menos significativo", () => {
    const e = new EscritorBits().bit(1).bit(0).bits(0b101, 3).bits(0, 3)
    expect(bin(e.aBuffer())).toBe("10101000")
  })

  it("codifica Exp-Golomb sin signo como H.264 (Tabla 9-2)", () => {
    const casos: [number, string][] = [
      [0, "1"],
      [1, "010"],
      [2, "011"],
      [3, "00100"],
      [7, "0001000"],
      [25, "000011010"],
    ]
    for (const [valor, codigo] of casos) {
      const e = new EscritorBits().ue(valor).alinear(0)
      expect(bin(e.aBuffer()).slice(0, codigo.length)).toBe(codigo)
    }
  })

  it("codifica Exp-Golomb con signo: 0, 1, −1, 2, −2", () => {
    const codigos = [0, 1, -1, 2, -2].map((valor) =>
      bin(new EscritorBits().se(valor).alinear(0).aBuffer())
    )
    expect(codigos.map((c) => c.replace(/0+$/, ""))).toEqual([
      "1",
      "01",
      "011",
      "001",
      "00101",
    ])
  })

  it("cierra el RBSP con un 1 y ceros hasta el byte", () => {
    expect(bin(new EscritorBits().bits(0b11, 2).cerrarRbsp().aBuffer())).toBe(
      "11100000"
    )
    // Ya alineado: un byte completo 0x80.
    expect([...new EscritorBits().cerrarRbsp().aBuffer()]).toEqual([0x80])
  })

  it("aplica el filtro de cada byte cerrado (relleno 0xFF 0x00 del JPEG)", () => {
    const e = new EscritorBits((byte) => (byte === 0xff ? [0xff, 0] : [byte]))
    e.bits(0xff, 8).bits(0x12, 8).bits(0b1, 1).alinear(1)
    expect([...e.aBuffer()]).toEqual([0xff, 0x00, 0x12, 0xff, 0x00])
  })

  it("copia bytes crudos solo alineado y crece sin perder lo escrito", () => {
    const grande = new Uint8Array(5000).fill(7)
    const e = new EscritorBits().bits(1, 8).bytes(grande)
    const salida = e.aBuffer()
    expect(salida.length).toBe(5001)
    expect(salida[0]).toBe(1)
    expect(salida[5000]).toBe(7)
    expect(() => new EscritorBits().bit(1).bytes([1])).toThrow(/alineado/)
    expect(() => new EscritorBits().bit(1).aBuffer()).toThrow(/Alinea/)
  })

  it("rechaza valores fuera de rango", () => {
    expect(() => new EscritorBits().ue(-1)).toThrow(RangeError)
    expect(() => new EscritorBits().se(1.5)).toThrow(RangeError)
    expect(() => new EscritorBits().bits(0, 33)).toThrow(RangeError)
  })
})
