import { describe, expect, it } from "vitest"

import { Constants } from "@/types/database.types"

import {
  documentosExigidos,
  documentosOpcionales,
  FICHAS_DOCUMENTO_ANUNCIANTE,
  fichaDocumento,
  nombreArchivoDocumento,
  ORDEN_DOCUMENTOS_ANUNCIANTE,
  REGLAS_DOCUMENTO_ANUNCIANTE,
  REGLAS_SELECCION_ANUNCIANTE,
} from "./catalogo"

describe("catálogo de documentos del anunciante", () => {
  it("tiene ficha y orden para cada tipo del enum de la BD", () => {
    const tipos = Constants.public.Enums.documento_anunciante_tipo
    expect([...ORDEN_DOCUMENTOS_ANUNCIANTE].sort()).toEqual([...tipos].sort())
    for (const tipo of tipos) {
      const ficha = FICHAS_DOCUMENTO_ANUNCIANTE[tipo]
      expect(ficha.titulo).not.toBe("")
      expect(ficha.descripcion).toMatch(/\.$/)
      expect(ficha.consejos.length).toBeGreaterThan(0)
      expect(ficha.enFrase).not.toBe("")
    }
  })

  it("nombra RUT y Cámara como el `detail` de la BD («Antes de enviar carga: RUT, Cámara de Comercio.»)", () => {
    expect(FICHAS_DOCUMENTO_ANUNCIANTE.RUT.titulo).toBe("RUT")
    expect(FICHAS_DOCUMENTO_ANUNCIANTE.CAMARA_COMERCIO.titulo).toBe(
      "Cámara de Comercio"
    )
  })

  it("Colombia exige RUT y Cámara; el exterior, uno de Cámara u «Otro»", () => {
    expect(documentosExigidos("CO")).toEqual({
      todos: ["RUT", "CAMARA_COMERCIO"],
      alguno: [],
    })
    expect(documentosExigidos("US")).toEqual({
      todos: [],
      alguno: ["CAMARA_COMERCIO", "OTRO"],
    })
  })

  it("ofrece el RUT solo a empresas colombianas", () => {
    expect(documentosOpcionales("CO")).toEqual(["CERT_BANCARIA", "OTRO"])
    expect(documentosOpcionales("MX")).toEqual(["CERT_BANCARIA"])
  })

  it("fuera de Colombia la Cámara se presenta como su equivalente", () => {
    expect(fichaDocumento("CAMARA_COMERCIO", "CO").titulo).toBe(
      "Cámara de Comercio"
    )
    expect(fichaDocumento("CAMARA_COMERCIO", "US").titulo).toBe(
      "Certificado de existencia"
    )
    expect(fichaDocumento("RUT", "US")).toBe(FICHAS_DOCUMENTO_ANUNCIANTE.RUT)
  })

  it("nombra el archivo descargado con el título y la extensión de su formato", () => {
    expect(nombreArchivoDocumento("RUT", "application/pdf")).toBe("RUT.pdf")
    expect(nombreArchivoDocumento("CAMARA_COMERCIO", "image/webp", "US")).toBe(
      "Certificado de existencia.webp"
    )
    expect(nombreArchivoDocumento("OTRO", null)).toBe("Otro documento")
    expect(nombreArchivoDocumento("OTRO", "application/zip")).toBe(
      "Otro documento"
    )
  })

  it("admite PDF y fotos de hasta 10 MB (y al elegir, fotos más pesadas que se reducen)", () => {
    expect(REGLAS_DOCUMENTO_ANUNCIANTE.mimes).toContain("application/pdf")
    expect(REGLAS_DOCUMENTO_ANUNCIANTE.maxBytes).toBe(10 * 1024 * 1024)
    expect(REGLAS_SELECCION_ANUNCIANTE.maxBytes).toBeGreaterThan(
      REGLAS_DOCUMENTO_ANUNCIANTE.maxBytes
    )
  })
})
