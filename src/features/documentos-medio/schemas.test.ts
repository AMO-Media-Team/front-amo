import { describe, expect, it } from "vitest"

import {
  esquemaConfirmarDocumento,
  esquemaFirmarDocumento,
  esquemaPrepararDocumento,
  LIMITES_DOCUMENTO,
} from "./schemas"

const ARCHIVO = {
  nombre: "cedula.webp",
  tipo: "image/webp",
  tamano: 850_000,
  sha256: null,
  dimensiones: { ancho: 1600, alto: 1000 },
  duracionSeg: null,
  conMiniatura: false,
}

const SUBIDO = {
  ...ARCHIVO,
  bucket: "documentos",
  ruta: "medio/0192f1c2-5b6a-7d00-8000-000000000001/CEDULA_FRENTE/0192f1c2-5b6a-7d00-8000-0000000000bb.webp",
  rutaMiniatura: null,
}

function primerMensaje(resultado: {
  success: boolean
  error?: { issues: { message: string }[] }
}): string | undefined {
  return resultado.error?.issues[0]?.message
}

describe("esquemaPrepararDocumento", () => {
  it("acepta un tipo válido con una foto o un PDF del bucket", () => {
    expect(
      esquemaPrepararDocumento.safeParse({
        tipo: "CEDULA_FRENTE",
        archivo: ARCHIVO,
      }).success
    ).toBe(true)
    expect(
      esquemaPrepararDocumento.safeParse({
        tipo: "RUT",
        archivo: { ...ARCHIVO, nombre: "rut.pdf", tipo: "application/pdf" },
      }).success
    ).toBe(true)
  })

  it("rechaza un tipo inexistente", () => {
    const resultado = esquemaPrepararDocumento.safeParse({
      tipo: "PASAPORTE",
      archivo: ARCHIVO,
    })
    expect(primerMensaje(resultado)).toBe("Ese tipo de documento no existe.")
  })

  it("rechaza formatos que el bucket no admite y archivos de más de 10 MB", () => {
    expect(
      esquemaPrepararDocumento.safeParse({
        tipo: "RUT",
        archivo: { ...ARCHIVO, tipo: "video/mp4" },
      }).success
    ).toBe(false)
    const grande = esquemaPrepararDocumento.safeParse({
      tipo: "RUT",
      archivo: { ...ARCHIVO, tamano: LIMITES_DOCUMENTO.maxBytes + 1 },
    })
    expect(primerMensaje(grande)).toMatch(/supera el máximo/)
  })

  it("no admite miniatura (documentos_medio no la guarda)", () => {
    const resultado = esquemaPrepararDocumento.safeParse({
      tipo: "RUT",
      archivo: { ...ARCHIVO, conMiniatura: true },
    })
    expect(primerMensaje(resultado)).toBe("Este documento no lleva miniatura.")
  })
})

describe("esquemaConfirmarDocumento", () => {
  it("acepta lo subido al bucket de documentos", () => {
    expect(
      esquemaConfirmarDocumento.safeParse({
        tipo: "CEDULA_FRENTE",
        archivo: SUBIDO,
      }).success
    ).toBe(true)
  })

  it("rechaza una miniatura y un bucket desconocido", () => {
    expect(
      primerMensaje(
        esquemaConfirmarDocumento.safeParse({
          tipo: "CEDULA_FRENTE",
          archivo: { ...SUBIDO, rutaMiniatura: `${SUBIDO.ruta}-min.webp` },
        })
      )
    ).toBe("Este documento no lleva miniatura.")
    expect(
      esquemaConfirmarDocumento.safeParse({
        tipo: "CEDULA_FRENTE",
        archivo: { ...SUBIDO, bucket: "publico" },
      }).success
    ).toBe(false)
  })
})

describe("esquemaFirmarDocumento", () => {
  it("exige un uuid y admite pedir la descarga", () => {
    expect(
      esquemaFirmarDocumento.safeParse({
        documentoId: "0192f1c2-5b6a-7d00-8000-0000000000aa",
        descargar: true,
      }).success
    ).toBe(true)
    expect(
      esquemaFirmarDocumento.safeParse({ documentoId: "../otro" }).success
    ).toBe(false)
  })
})
