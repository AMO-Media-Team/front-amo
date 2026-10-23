// @vitest-environment node
import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  duracionVideo,
  huellaSha256,
  imagenPrueba,
  medidasParaRelacion,
  pdfPrueba,
  relacionAspecto,
  videoPrueba,
} from "./archivos-e2e"

describe("imagenPrueba", () => {
  it("genera un PNG con nombre, MIME y medidas en su cabecera", () => {
    const png = imagenPrueba({ ancho: 1080, alto: 1350 })
    expect(png.name).toBe("muestra-1080x1350.png")
    expect(png.mimeType).toBe("image/png")
    // IHDR: ancho y alto tras la firma (8) + largo (4) + tipo (4).
    expect(png.buffer.readUInt32BE(16)).toBe(1080)
    expect(png.buffer.readUInt32BE(20)).toBe(1350)
  })

  it("genera un JPEG y respeta el nombre pedido", () => {
    const jpeg = imagenPrueba({
      ancho: 640,
      alto: 640,
      formato: "jpeg",
      nombre: "foto.jpg",
    })
    expect(jpeg).toMatchObject({ name: "foto.jpg", mimeType: "image/jpeg" })
    expect([...jpeg.buffer.subarray(0, 2)]).toEqual([0xff, 0xd8])
  })

  it("alcanza el peso pedido (la imagen de ~12 MB) en PNG y en JPEG", () => {
    const doceMb = 12 * 1024 * 1024
    for (const formato of ["png", "jpeg"] as const) {
      const pesada = imagenPrueba({
        ancho: 1080,
        alto: 1080,
        formato,
        bytesMinimos: doceMb,
      })
      expect(pesada.buffer.length).toBeGreaterThanOrEqual(doceMb)
      expect(pesada.buffer.length).toBeLessThan(doceMb + 16)
    }
  })

  it("es determinista: los mismos parámetros dan la misma huella", () => {
    const a = imagenPrueba({ ancho: 300, alto: 200 })
    const b = imagenPrueba({ ancho: 300, alto: 200 })
    expect(huellaSha256(a)).toBe(huellaSha256(b))
    expect(huellaSha256(a)).not.toBe(
      huellaSha256(imagenPrueba({ ancho: 300, alto: 201 }))
    )
  })
})

describe("videoPrueba y duracionVideo", () => {
  it("genera un MP4 con la duración redondeada a décimas en el nombre", () => {
    const video = videoPrueba({ ancho: 360, alto: 640, segundos: 2.54 })
    expect(video.name).toBe("muestra-360x640-2.5s.mp4")
    expect(video.mimeType).toBe("video/mp4")
    expect(video.buffer.toString("ascii", 4, 8)).toBe("ftyp")
    expect(duracionVideo(2.54)).toBe(2.5)
    expect(duracionVideo()).toBe(3)
  })
})

describe("pdfPrueba", () => {
  it("nombra el archivo por el título, sin tildes", () => {
    const pdf = pdfPrueba({ titulo: "Cámara de Comercio" })
    expect(pdf.name).toBe("camara-de-comercio-prueba.pdf")
    expect(pdf.mimeType).toBe("application/pdf")
    expect(pdf.buffer.toString("latin1", 0, 8)).toBe("%PDF-1.4")
  })
})

describe("huellaSha256", () => {
  it("es el SHA-256 hexadecimal del contenido", () => {
    const datos = Buffer.from("AMO")
    expect(huellaSha256(datos)).toBe(
      createHash("sha256").update(datos).digest("hex")
    )
    expect(huellaSha256(datos)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("relaciones de aspecto", () => {
  it("interpreta «a:b» como la BD", () => {
    expect(relacionAspecto("9:16")).toBeCloseTo(0.5625)
    expect(relacionAspecto("1.91:1")).toBeCloseTo(1.91)
    expect(() => relacionAspecto("vertical")).toThrow(RangeError)
    expect(() => relacionAspecto("1:0")).toThrow(RangeError)
  })

  it("calcula medidas con el lado mayor y, para video, pares", () => {
    expect(medidasParaRelacion("1:1", 1080)).toEqual({
      ancho: 1080,
      alto: 1080,
    })
    expect(medidasParaRelacion("4:5", 1080)).toEqual({ ancho: 864, alto: 1080 })
    expect(medidasParaRelacion("9:16", 1920)).toEqual({
      ancho: 1080,
      alto: 1920,
    })
    expect(medidasParaRelacion("1.91:1", 1080)).toEqual({
      ancho: 1080,
      alto: 565,
    })
    expect(medidasParaRelacion("16:9", 640, { pares: true })).toEqual({
      ancho: 640,
      alto: 360,
    })
    expect(medidasParaRelacion("1.91:1", 1080, { pares: true })).toEqual({
      ancho: 1080,
      alto: 566,
    })
  })

  it("las medidas caen dentro de la tolerancia de la BD (2 %)", () => {
    for (const relacion of ["1:1", "4:5", "1.91:1", "9:16", "16:9"]) {
      const { ancho, alto } = medidasParaRelacion(relacion, 1080)
      expect(
        Math.abs(ancho / alto / relacionAspecto(relacion) - 1)
      ).toBeLessThanOrEqual(0.02)
    }
  })
})
