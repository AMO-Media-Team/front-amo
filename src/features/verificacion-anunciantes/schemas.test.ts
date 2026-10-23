import { describe, expect, it } from "vitest"

import {
  esquemaAprobarDocumentoAnunciante,
  esquemaConfirmarCarga,
  esquemaMotivoAnunciante,
  esquemaPrepararCarga,
  esquemaRechazarDocumentoAnunciante,
} from "./schemas"

const ID = "0192f3a4-5b6c-7d8e-9f01-000000000001"
const EMPRESA = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"

function primerMensaje(resultado: {
  success: boolean
  error?: { issues: { message: string; path: PropertyKey[] }[] }
}): string | undefined {
  return resultado.error?.issues[0]?.message
}

describe("aprobar un documento", () => {
  it("la vigencia y las observaciones vacías quedan en null", () => {
    expect(
      esquemaAprobarDocumentoAnunciante.parse({
        documentoId: ID,
        fechaVencimiento: "",
        observaciones: "  ",
      })
    ).toEqual({ documentoId: ID, fechaVencimiento: null, observaciones: null })
    expect(
      esquemaAprobarDocumentoAnunciante.parse({ documentoId: ID })
    ).toEqual({ documentoId: ID, fechaVencimiento: null, observaciones: null })
  })

  it("rechaza un día que no existe", () => {
    const resultado = esquemaAprobarDocumentoAnunciante.safeParse({
      documentoId: ID,
      fechaVencimiento: "2026-02-30",
    })
    expect(primerMensaje(resultado)).toBe("Escribe una fecha válida.")
  })

  it("las observaciones admiten hasta 1.000 caracteres", () => {
    const resultado = esquemaAprobarDocumentoAnunciante.safeParse({
      documentoId: ID,
      observaciones: "a".repeat(1001),
    })
    expect(primerMensaje(resultado)).toBe("Máximo 1.000 caracteres.")
  })
})

describe("motivos", () => {
  it("rechazar un documento exige al menos 5 caracteres", () => {
    expect(
      primerMensaje(
        esquemaRechazarDocumentoAnunciante.safeParse({
          documentoId: ID,
          motivo: " no ",
        })
      )
    ).toBe("Describe el motivo (al menos 5 caracteres).")
  })

  it("rechazar, suspender o reactivar la empresa recorta y limita el motivo", () => {
    expect(
      esquemaMotivoAnunciante.parse({
        anuncianteId: EMPRESA,
        motivo: "  RUT ilegible  ",
      })
    ).toEqual({ anuncianteId: EMPRESA, motivo: "RUT ilegible" })
    expect(
      primerMensaje(
        esquemaMotivoAnunciante.safeParse({
          anuncianteId: EMPRESA,
          motivo: "x".repeat(501),
        })
      )
    ).toBe("Máximo 500 caracteres.")
  })

  it("un identificador que no es uuid no pasa", () => {
    expect(
      primerMensaje(
        esquemaMotivoAnunciante.safeParse({
          anuncianteId: "abc",
          motivo: "Motivo válido",
        })
      )
    ).toBe("Identificador inválido.")
  })
})

describe("carga por cuenta de la empresa", () => {
  const ARCHIVO = {
    nombre: "rut.pdf",
    tipo: "application/pdf",
    tamano: 120_000,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: false,
  }

  it("acepta un PDF de un tipo de documento del catálogo", () => {
    expect(
      esquemaPrepararCarga.safeParse({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: ARCHIVO,
      }).success
    ).toBe(true)
  })

  it("rechaza un tipo que no existe, un formato ajeno y la miniatura", () => {
    expect(
      primerMensaje(
        esquemaPrepararCarga.safeParse({
          anuncianteId: EMPRESA,
          tipo: "CEDULA_FRENTE",
          archivo: ARCHIVO,
        })
      )
    ).toBe("Elige el tipo de documento.")
    expect(
      esquemaPrepararCarga.safeParse({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: { ...ARCHIVO, tipo: "video/mp4" },
      }).success
    ).toBe(false)
    expect(
      primerMensaje(
        esquemaPrepararCarga.safeParse({
          anuncianteId: EMPRESA,
          tipo: "RUT",
          archivo: { ...ARCHIVO, conMiniatura: true },
        })
      )
    ).toBe("Este documento no lleva miniatura.")
  })

  it("el tope es el del bucket de documentos (10 MB)", () => {
    expect(
      esquemaPrepararCarga.safeParse({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: { ...ARCHIVO, tamano: 10 * 1024 * 1024 + 1 },
      }).success
    ).toBe(false)
  })

  it("al confirmar exige la ruta subida y ninguna miniatura", () => {
    const subido = {
      ...ARCHIVO,
      bucket: "documentos",
      ruta: `anunciante/${EMPRESA}/RUT/0192f3a4-5b6c-7d8e-9f01-0000000000ff.pdf`,
      rutaMiniatura: null,
    }
    expect(
      esquemaConfirmarCarga.safeParse({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: subido,
      }).success
    ).toBe(true)
    expect(
      primerMensaje(
        esquemaConfirmarCarga.safeParse({
          anuncianteId: EMPRESA,
          tipo: "RUT",
          archivo: { ...subido, rutaMiniatura: "x-min.webp" },
        })
      )
    ).toBe("Este documento no lleva miniatura.")
  })
})
