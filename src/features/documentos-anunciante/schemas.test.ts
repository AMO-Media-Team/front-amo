import { describe, expect, it } from "vitest"

import {
  interpretarErrorDocumentoAnunciante,
  mensajeValidacion,
} from "./errores"
import {
  esquemaConfirmarDocumentoAnunciante,
  esquemaFirmarDocumentoAnunciante,
  esquemaPrepararDocumentoAnunciante,
} from "./schemas"

const ARCHIVO = {
  nombre: "rut.pdf",
  tipo: "application/pdf",
  tamano: 300_000,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: false,
}

describe("esquemas de documentos del anunciante", () => {
  it("acepta un PDF de un tipo del enum", () => {
    expect(
      esquemaPrepararDocumentoAnunciante.safeParse({
        tipo: "RUT",
        archivo: ARCHIVO,
      }).success
    ).toBe(true)
  })

  it("rechaza un tipo inexistente, un formato no admitido, un peso excesivo o una miniatura", () => {
    const tipo = esquemaPrepararDocumentoAnunciante.safeParse({
      tipo: "CEDULA_FRENTE",
      archivo: ARCHIVO,
    })
    expect(tipo.success).toBe(false)
    const formato = esquemaPrepararDocumentoAnunciante.safeParse({
      tipo: "RUT",
      archivo: { ...ARCHIVO, tipo: "video/mp4" },
    })
    expect(formato.success).toBe(false)
    const peso = esquemaPrepararDocumentoAnunciante.safeParse({
      tipo: "RUT",
      archivo: { ...ARCHIVO, tamano: 11 * 1024 * 1024 },
    })
    expect(peso.success).toBe(false)
    if (!peso.success) {
      expect(mensajeValidacion(peso.error)).toMatch(/supera el máximo de 10/)
    }
    expect(
      esquemaPrepararDocumentoAnunciante.safeParse({
        tipo: "RUT",
        archivo: { ...ARCHIVO, conMiniatura: true },
      }).success
    ).toBe(false)
  })

  it("al confirmar exige bucket y ruta, sin miniatura", () => {
    const subido = {
      ...ARCHIVO,
      bucket: "documentos",
      ruta: "anunciante/a/RUT/b.pdf",
      rutaMiniatura: null,
    }
    expect(
      esquemaConfirmarDocumentoAnunciante.safeParse({
        tipo: "RUT",
        archivo: subido,
      }).success
    ).toBe(true)
    expect(
      esquemaConfirmarDocumentoAnunciante.safeParse({
        tipo: "RUT",
        archivo: { ...subido, rutaMiniatura: "x-min.webp" },
      }).success
    ).toBe(false)
  })

  it("firmar pide un uuid", () => {
    expect(
      esquemaFirmarDocumentoAnunciante.safeParse({ documentoId: "x" }).success
    ).toBe(false)
    expect(
      esquemaFirmarDocumentoAnunciante.safeParse({
        documentoId: "0192f1c2-5b6a-7d00-8000-000000000001",
        descargar: true,
      }).success
    ).toBe(true)
  })
})

describe("interpretarErrorDocumentoAnunciante", () => {
  it("traduce las restricciones propias sin mostrar el mensaje técnico", () => {
    expect(
      interpretarErrorDocumentoAnunciante({
        code: "23514",
        message:
          'new row for relation "documentos_anunciante" violates check constraint "documentos_anunciante_archivo_path_chk"',
      })
    ).toMatchObject({
      mensaje:
        "El archivo no quedó guardado en la carpeta de este documento. Súbelo de nuevo.",
      esperado: true,
    })
  })

  it("usa el `detail` de un error de negocio", () => {
    expect(
      interpretarErrorDocumentoAnunciante({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details: "No tienes permiso para esta acción.",
      }).mensaje
    ).toBe("No tienes permiso para esta acción.")
  })
})
