import { describe, expect, it } from "vitest"

import { BUCKETS } from "@/lib/archivos/buckets"
import { Constants } from "@/types/database.types"

import {
  esVoluntario,
  FICHAS_DOCUMENTO,
  nombreArchivoDocumento,
  ORDEN_DOCUMENTOS,
  REGLAS_DOCUMENTO,
  REGLAS_SELECCION,
} from "./catalogo"

const TIPOS = Constants.public.Enums.documento_medio_tipo

describe("catálogo de documentos del medio", () => {
  it("ordena cada tipo de la BD exactamente una vez", () => {
    expect([...ORDEN_DOCUMENTOS].sort()).toEqual([...TIPOS].sort())
    expect(new Set(ORDEN_DOCUMENTOS).size).toBe(ORDEN_DOCUMENTOS.length)
  })

  it("describe cada tipo con título, descripción y al menos un consejo", () => {
    for (const tipo of TIPOS) {
      const ficha = FICHAS_DOCUMENTO[tipo]
      expect(ficha.titulo.trim()).not.toBe("")
      expect(ficha.descripcion.trim()).not.toBe("")
      expect(ficha.consejos.length).toBeGreaterThan(0)
    }
  })

  it("solo la prueba de vida es biométrica (voluntaria) y usa la cámara frontal", () => {
    const voluntarios = TIPOS.filter(esVoluntario)
    expect(voluntarios).toEqual(["PRUEBA_VIDA"])
    const frontales = TIPOS.filter(
      (tipo) => FICHAS_DOCUMENTO[tipo].camara === "user"
    )
    expect(frontales).toEqual(["PRUEBA_VIDA"])
  })

  it("admite lo mismo que el bucket privado, con margen al elegir para comprimir después", () => {
    expect(REGLAS_DOCUMENTO.mimes).toEqual(BUCKETS.documentos.mimes)
    expect(REGLAS_DOCUMENTO.maxBytes).toBe(BUCKETS.documentos.maxBytes)
    expect(REGLAS_SELECCION.mimes).toEqual(REGLAS_DOCUMENTO.mimes)
    expect(REGLAS_SELECCION.maxBytes).toBeGreaterThan(REGLAS_DOCUMENTO.maxBytes)
  })
})

describe("nombreArchivoDocumento", () => {
  it("usa el título del tipo con la extensión de su formato", () => {
    expect(nombreArchivoDocumento("CERT_BANCARIA", "application/pdf")).toBe(
      "Certificación bancaria.pdf"
    )
    expect(nombreArchivoDocumento("CEDULA_FRENTE", "image/webp")).toBe(
      "Documento de identidad (frente).webp"
    )
  })

  it("sin formato conocido deja solo el título", () => {
    expect(nombreArchivoDocumento("RUT", null)).toBe("RUT")
    expect(nombreArchivoDocumento("RUT", "application/x-desconocido")).toBe(
      "RUT"
    )
  })
})
