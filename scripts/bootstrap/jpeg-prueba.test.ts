// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  categoria,
  codigosHuffman,
  dcDeBloque,
  ErrorJpegPrueba,
  jpegDeMuestra,
  yCbCrJfif,
} from "./jpeg-prueba"

const FONDO = [237, 231, 254] as const
const FRANJA = [117, 73, 222] as const

interface Segmento {
  marcador: number
  datos: Buffer
}

/** Segmentos hasta SOS (el resto es código de entropía hasta EOI). */
function segmentos(jpeg: Buffer): { lista: Segmento[]; entropia: Buffer } {
  const lista: Segmento[] = []
  let posicion = 2
  for (;;) {
    const marcador = jpeg[posicion + 1]
    const largo = jpeg.readUInt16BE(posicion + 2)
    const datos = jpeg.subarray(posicion + 4, posicion + 2 + largo)
    lista.push({ marcador, datos })
    posicion += 2 + largo
    if (marcador === 0xda) {
      return { lista, entropia: jpeg.subarray(posicion, jpeg.length - 2) }
    }
  }
}

describe("jpegDeMuestra", () => {
  const jpeg = jpegDeMuestra({
    ancho: 1081,
    alto: 1919,
    fondo: FONDO,
    franja: FRANJA,
  })

  it("empieza en SOI, termina en EOI y lleva JFIF, DQT, SOF0, DHT y SOS en orden", () => {
    expect([...jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8])
    expect([...jpeg.subarray(-2)]).toEqual([0xff, 0xd9])
    const { lista } = segmentos(jpeg)
    expect(lista.map((s) => s.marcador)).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda])
    expect(lista[0].datos.toString("ascii", 0, 5)).toBe("JFIF\0")
  })

  it("SOF0 declara 8 bits, el alto, el ancho y tres componentes 4:4:4", () => {
    const sof = segmentos(jpeg).lista.find((s) => s.marcador === 0xc0)
    expect(sof?.datos[0]).toBe(8)
    expect(sof?.datos.readUInt16BE(1)).toBe(1919)
    expect(sof?.datos.readUInt16BE(3)).toBe(1081)
    expect([...(sof?.datos.subarray(5) ?? [])]).toEqual([
      3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
    ])
  })

  it("el código de entropía no contiene marcadores (cada 0xFF va seguido de 0x00)", () => {
    const { entropia } = segmentos(jpeg)
    for (let i = 0; i < entropia.length; i += 1) {
      if (entropia[i] === 0xff) expect(entropia[i + 1]).toBe(0)
    }
  })

  it("con bytesMinimos agrega comentarios hasta ese peso, sin tocar la imagen", () => {
    const pesado = jpegDeMuestra({
      ancho: 1081,
      alto: 1919,
      fondo: FONDO,
      franja: FRANJA,
      bytesMinimos: 200_000,
    })
    expect(pesado.length).toBeGreaterThanOrEqual(200_000)
    expect(pesado.length).toBeLessThan(200_000 + 4)
    const { lista, entropia } = segmentos(pesado)
    const comentarios = lista.filter((s) => s.marcador === 0xfe)
    expect(comentarios.length).toBe(Math.ceil((200_000 - jpeg.length) / 65_537))
    expect(entropia.equals(segmentos(jpeg).entropia)).toBe(true)
  })

  it("rechaza medidas que JPEG no admite", () => {
    const base = { fondo: FONDO, franja: FRANJA }
    expect(() => jpegDeMuestra({ ...base, ancho: 0, alto: 10 })).toThrow(
      ErrorJpegPrueba
    )
    expect(() => jpegDeMuestra({ ...base, ancho: 70_000, alto: 10 })).toThrow(
      /65 535/
    )
  })
})

describe("piezas del JPEG", () => {
  it("genera los códigos canónicos de la tabla DC estándar (T.81 K.3)", () => {
    const codigos = codigosHuffman(
      [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    )
    const texto = (simbolo: number) => {
      const c = codigos.get(simbolo)
      return c ? c.codigo.toString(2).padStart(c.largo, "0") : ""
    }
    expect(texto(0)).toBe("00")
    expect(texto(1)).toBe("010")
    expect(texto(5)).toBe("110")
    expect(texto(6)).toBe("1110")
    expect(texto(11)).toBe("111111110")
  })

  it("calcula la categoría de una diferencia", () => {
    expect(categoria(0)).toBe(0)
    expect(categoria(1)).toBe(1)
    expect(categoria(-1)).toBe(1)
    expect(categoria(255)).toBe(8)
    expect(categoria(-2040)).toBe(11)
  })

  it("convierte a YCbCr JFIF y calcula el DC de un bloque constante", () => {
    const [y, cb, cr] = yCbCrJfif([255, 255, 255])
    expect(y).toBeCloseTo(255)
    expect(cb).toBeCloseTo(128)
    expect(cr).toBeCloseTo(128)
    expect(dcDeBloque(128)).toBe(0)
    expect(dcDeBloque(0)).toBe(-1024)
    expect(dcDeBloque(255)).toBe(1016)
  })
})
