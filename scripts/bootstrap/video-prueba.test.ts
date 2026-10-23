// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  conPrevencionEmulacion,
  CUADROS_POR_SEGUNDO,
  cuadrosDeVideo,
  ErrorVideoPrueba,
  mp4DeMuestra,
  nivelH264,
  yCbCrLimitado,
} from "./video-prueba"

const FONDO = [237, 231, 254] as const
const FRANJA = [117, 73, 222] as const

interface Caja {
  tipo: string
  inicio: number
  datos: Buffer
}

/** Cajas hijas de `datos` (ISO BMFF: largo de 32 bits + tipo). */
function cajas(datos: Buffer, desplazamiento = 0): Caja[] {
  const lista: Caja[] = []
  let posicion = 0
  while (posicion < datos.length) {
    const largo = datos.readUInt32BE(posicion)
    lista.push({
      tipo: datos.toString("ascii", posicion + 4, posicion + 8),
      inicio: desplazamiento + posicion,
      datos: datos.subarray(posicion + 8, posicion + largo),
    })
    posicion += largo
  }
  return lista
}

function caja(datos: Buffer, ruta: string[], prefijos: number[] = []): Caja {
  let actual: Caja = { tipo: "", inicio: 0, datos }
  ruta.forEach((tipo, i) => {
    const salto = prefijos[i] ?? 0
    const encontrada = cajas(actual.datos.subarray(salto)).find(
      (c) => c.tipo === tipo
    )
    if (!encontrada)
      throw new Error(`Falta la caja ${ruta.slice(0, i + 1).join("/")}`)
    actual = encontrada
  })
  return actual
}

/** Lector de bits con Exp-Golomb (para leer el SPS). */
class LectorBits {
  private posicion = 0
  constructor(private readonly datos: Buffer) {}
  bit(): number {
    const byte = this.datos[this.posicion >> 3]
    const valor = (byte >> (7 - (this.posicion & 7))) & 1
    this.posicion += 1
    return valor
  }
  bits(cantidad: number): number {
    let valor = 0
    for (let i = 0; i < cantidad; i += 1) valor = valor * 2 + this.bit()
    return valor
  }
  ue(): number {
    let ceros = 0
    while (this.bit() === 0) ceros += 1
    return 2 ** ceros - 1 + this.bits(ceros)
  }
}

function sinPrevencion(nal: Buffer): Buffer {
  const salida: number[] = []
  for (let i = 0; i < nal.length; i += 1) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue
    salida.push(nal[i])
  }
  return Buffer.from(salida)
}

function leerSps(mp4: Buffer) {
  const stsd = caja(mp4, ["moov", "trak", "mdia", "minf", "stbl", "stsd"])
  // stsd: versión/banderas (4) + cantidad (4); avc1: 78 bytes de entrada visual.
  const avc1 = cajas(stsd.datos.subarray(8))[0]
  const avcC = cajas(avc1.datos.subarray(78)).find((c) => c.tipo === "avcC")
  if (!avcC) throw new Error("Falta avcC")
  const largoSps = avcC.datos.readUInt16BE(6)
  const sps = sinPrevencion(avcC.datos.subarray(8, 8 + largoSps))
  const lector = new LectorBits(sps.subarray(1))
  const perfil = lector.bits(8)
  lector.bits(8)
  const nivel = lector.bits(8)
  lector.ue() // id
  lector.ue() // log2_max_frame_num_minus4
  const tipoPoc = lector.ue()
  lector.ue() // max_num_ref_frames
  lector.bit()
  const mbAncho = lector.ue() + 1
  const mbAlto = lector.ue() + 1
  lector.bit() // frame_mbs_only_flag
  lector.bit()
  const recorte = lector.bit()
  const [izq, der, arr, aba] = recorte
    ? [lector.ue(), lector.ue(), lector.ue(), lector.ue()]
    : [0, 0, 0, 0]
  return {
    cabecera: sps[0],
    perfil,
    nivel,
    tipoPoc,
    ancho: mbAncho * 16 - 2 * (izq + der),
    alto: mbAlto * 16 - 2 * (arr + aba),
    nivelAvcC: avcC.datos[3],
  }
}

describe("mp4DeMuestra", () => {
  const mp4 = mp4DeMuestra({
    ancho: 360,
    alto: 640,
    segundos: 3,
    fondo: FONDO,
    franja: FRANJA,
  })

  it("es un MP4 con ftyp, moov antes de mdat y marcas compatibles", () => {
    const tipos = cajas(mp4).map((c) => c.tipo)
    expect(tipos).toEqual(["ftyp", "moov", "mdat"])
    const ftyp = caja(mp4, ["ftyp"])
    expect(ftyp.datos.toString("ascii", 0, 4)).toBe("isom")
    expect(ftyp.datos.toString("ascii", 8)).toContain("avc1")
  })

  it("declara la duración en mvhd, tkhd y mdhd (milisegundos)", () => {
    const mvhd = caja(mp4, ["moov", "mvhd"])
    expect(mvhd.datos.readUInt32BE(12)).toBe(1000)
    expect(mvhd.datos.readUInt32BE(16)).toBe(3000)
    const tkhd = caja(mp4, ["moov", "trak", "tkhd"])
    expect(tkhd.datos.readUInt32BE(20)).toBe(3000)
    // Ancho y alto en 16.16.
    expect(tkhd.datos.readUInt32BE(76) / 0x10000).toBe(360)
    expect(tkhd.datos.readUInt32BE(80) / 0x10000).toBe(640)
    const mdhd = caja(mp4, ["moov", "trak", "mdia", "mdhd"])
    expect(mdhd.datos.readUInt32BE(16)).toBe(3000)
  })

  it("tiene un cuadro por décima de segundo y solo el primero es de sincronía", () => {
    const stbl = ["moov", "trak", "mdia", "minf", "stbl"]
    const stts = caja(mp4, [...stbl, "stts"])
    expect(stts.datos.readUInt32BE(8)).toBe(30)
    expect(stts.datos.readUInt32BE(12)).toBe(1000 / CUADROS_POR_SEGUNDO)
    const stss = caja(mp4, [...stbl, "stss"])
    expect(stss.datos.readUInt32BE(4)).toBe(1)
    expect(stss.datos.readUInt32BE(8)).toBe(1)
    const stsz = caja(mp4, [...stbl, "stsz"])
    expect(stsz.datos.readUInt32BE(8)).toBe(30)
  })

  it("el desplazamiento del bloque apunta al inicio de los datos de mdat", () => {
    const stbl = ["moov", "trak", "mdia", "minf", "stbl"]
    const stco = caja(mp4, [...stbl, "stco"])
    const mdat = cajas(mp4).find((c) => c.tipo === "mdat")
    expect(stco.datos.readUInt32BE(8)).toBe((mdat?.inicio ?? 0) + 8)
    // La primera muestra es una NAL IDR (tipo 5) con su largo de 4 bytes.
    const primera = mp4.subarray(stco.datos.readUInt32BE(8))
    expect(primera[4] & 0x1f).toBe(5)
    // Las tallas de stsz suman el contenido de mdat.
    const stsz = caja(mp4, [...stbl, "stsz"])
    let suma = 0
    for (let i = 0; i < 30; i += 1) suma += stsz.datos.readUInt32BE(12 + 4 * i)
    expect(suma).toBe(mdat?.datos.length)
  })

  it("el SPS describe H.264 Baseline con las medidas visibles (recorte incluido)", () => {
    const sps = leerSps(mp4)
    expect(sps.cabecera & 0x1f).toBe(7)
    expect(sps.perfil).toBe(66)
    expect(sps.tipoPoc).toBe(2)
    expect(sps.ancho).toBe(360)
    expect(sps.alto).toBe(640)
    expect(sps.nivel).toBe(sps.nivelAvcC)
  })

  it("recorta los videos cuyo lado no es múltiplo de 16 (1080 × 1920)", () => {
    const grande = mp4DeMuestra({
      ancho: 1080,
      alto: 1920,
      segundos: 0.1,
      fondo: FONDO,
      franja: FRANJA,
    })
    expect(leerSps(grande)).toMatchObject({
      ancho: 1080,
      alto: 1920,
      nivel: 40,
    })
    // ~384 bytes por macrobloque del cuadro I_PCM: 68 × 120 = 8160.
    expect(grande.length).toBeGreaterThan(8160 * 384)
    expect(grande.length).toBeLessThan(8160 * 400)
  })

  it("rechaza medidas impares o una duración no positiva", () => {
    const base = { segundos: 1, fondo: FONDO, franja: FRANJA }
    expect(() => mp4DeMuestra({ ...base, ancho: 361, alto: 640 })).toThrow(
      ErrorVideoPrueba
    )
    expect(() => mp4DeMuestra({ ...base, ancho: 360, alto: 0 })).toThrow(
      /par positivo/
    )
    expect(() =>
      mp4DeMuestra({ ...base, ancho: 360, alto: 640, segundos: 0 })
    ).toThrow(/positiva/)
  })
})

describe("piezas del video", () => {
  it("cuenta los cuadros a 10 por segundo, con al menos uno", () => {
    expect(cuadrosDeVideo(3)).toBe(30)
    expect(cuadrosDeVideo(2.54)).toBe(25)
    expect(cuadrosDeVideo(0.01)).toBe(1)
    expect(() => cuadrosDeVideo(Number.NaN)).toThrow(ErrorVideoPrueba)
  })

  it("elige el nivel mínimo que admite el cuadro", () => {
    expect(nivelH264(23, 40)).toBe(22) // 360 × 640: 920 macrobloques
    expect(nivelH264(68, 120)).toBe(40) // 1080 × 1920
    expect(nivelH264(5, 5)).toBe(10)
    expect(() => nivelH264(1000, 1000)).toThrow(/demasiado grande/)
  })

  it("convierte RGB a YCbCr BT.601 limitado, sin ceros", () => {
    expect(yCbCrLimitado([0, 0, 0])).toEqual([16, 128, 128])
    expect(yCbCrLimitado([255, 255, 255])).toEqual([235, 128, 128])
    expect(yCbCrLimitado([255, 0, 0])).toEqual([81, 90, 240])
  })

  it("inserta 0x03 tras dos ceros seguidos de un byte ≤ 3", () => {
    expect([
      ...conPrevencionEmulacion(Buffer.of(0, 0, 1, 0, 0, 0, 0, 4)),
    ]).toEqual([0, 0, 3, 1, 0, 0, 3, 0, 0, 4])
    expect([...conPrevencionEmulacion(Buffer.of(0, 0, 4, 0, 1))]).toEqual([
      0, 0, 4, 0, 1,
    ])
  })
})
