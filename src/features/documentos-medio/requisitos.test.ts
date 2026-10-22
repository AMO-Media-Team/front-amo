import { describe, expect, it } from "vitest"

import {
  certificadoDePago,
  documentosExigidos,
  documentosOpcionales,
  esNivel,
  explicacionRecomendacion,
  NIVEL_DE_ENTRADA,
  nivelInicial,
  nivelRecomendado,
  nivelVerificado,
} from "./requisitos"
import type { PerfilTributario, RequisitosNivel } from "./tipos"

const NIVEL_1: RequisitosNivel = {
  nivel: 1,
  nombre: "Persona natural informal",
  requisitos: ["Cédula de ciudadanía por ambas caras"],
  documentos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
}

const NIVEL_3: RequisitosNivel = {
  nivel: 3,
  nombre: "Persona jurídica",
  requisitos: [],
  // Desordenados a propósito: la lista sigue el orden del catálogo.
  documentos: [
    "RUT_SOCIEDAD",
    "CEDULA_FRENTE",
    "CAMARA_COMERCIO",
    "PRUEBA_VIDA",
    "RUT",
    "CEDULA_REVERSO",
  ],
}

const SIN_DECLARAR: PerfilTributario = {
  metodoPago: null,
  tipoDocumento: null,
  esDeclarante: false,
  obligadoFacturar: false,
  responsableIva: false,
}

describe("esNivel", () => {
  it("acepta solo 1, 2 y 3", () => {
    expect([1, 2, 3].every(esNivel)).toBe(true)
    expect([0, 4, "1", null, 1.5].some(esNivel)).toBe(false)
  })
})

describe("certificadoDePago", () => {
  it("pide el certificado del medio de pago declarado", () => {
    expect(certificadoDePago("BANCARIO")).toBe("CERT_BANCARIA")
    expect(certificadoDePago("BILLETERA")).toBe("CERT_BILLETERA")
    expect(certificadoDePago(null)).toBeNull()
  })
})

describe("documentosExigidos", () => {
  it("suma al nivel el certificado del medio de pago (como la BD)", () => {
    expect(documentosExigidos(NIVEL_1, "BANCARIO")).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "CERT_BANCARIA",
    ])
    expect(documentosExigidos(NIVEL_1, "BILLETERA")).toContain("CERT_BILLETERA")
  })

  it("sin medio de pago no sabe qué certificado pedir", () => {
    expect(documentosExigidos(NIVEL_1, null)).toEqual(NIVEL_1.documentos)
  })

  it("lista en el orden del catálogo: identidad, tributarios y pago", () => {
    expect(documentosExigidos(NIVEL_3, "BANCARIO")).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "PRUEBA_VIDA",
      "RUT",
      "RUT_SOCIEDAD",
      "CAMARA_COMERCIO",
      "CERT_BANCARIA",
    ])
  })

  it("un nivel sin configurar solo exige el certificado de pago", () => {
    expect(documentosExigidos(undefined, "BANCARIO")).toEqual(["CERT_BANCARIA"])
    expect(documentosExigidos(undefined, null)).toEqual([])
  })
})

describe("documentosOpcionales", () => {
  it("ofrece siempre la seguridad social y lo ya cargado fuera del nivel", () => {
    const exigidos = documentosExigidos(NIVEL_1, "BANCARIO")
    expect(
      documentosOpcionales(exigidos, [
        { tipo: "RUT" },
        { tipo: "CEDULA_FRENTE" },
        { tipo: "RUT" },
      ])
    ).toEqual(["RUT", "SEG_SOCIAL"])
  })

  it("no repite lo que el nivel ya exige", () => {
    expect(
      documentosOpcionales(
        ["SEG_SOCIAL", "CEDULA_FRENTE"],
        [{ tipo: "CEDULA_FRENTE" }]
      )
    ).toEqual([])
  })
})

describe("nivelVerificado y nivelInicial", () => {
  it("un medio verificado (o suspendido) conserva su nivel", () => {
    expect(nivelVerificado({ estado: "VERIFICADO", nivel: 2 })).toBe(2)
    expect(nivelVerificado({ estado: "SUSPENDIDO", nivel: 3 })).toBe(3)
    expect(nivelInicial({ estado: "VERIFICADO", nivel: 2 })).toBe(2)
  })

  it("en alta no tiene nivel y se abre en el de entrada", () => {
    for (const estado of ["PENDIENTE", "RECHAZADO"] as const) {
      expect(nivelVerificado({ estado, nivel: 0 })).toBeNull()
      expect(nivelInicial({ estado, nivel: 0 })).toBe(NIVEL_DE_ENTRADA)
    }
  })

  it("un nivel fuera de rango no cuenta como verificado", () => {
    expect(nivelVerificado({ estado: "VERIFICADO", nivel: 0 })).toBeNull()
    expect(nivelInicial({ estado: "VERIFICADO", nivel: 0 })).toBe(1)
  })
})

describe("nivelRecomendado", () => {
  it("con NIT recomienda el nivel de persona jurídica", () => {
    expect(
      nivelRecomendado({ ...SIN_DECLARAR, tipoDocumento: "NIT" }, 1)
    ).toEqual({ nivel: 3, motivo: "persona-juridica" })
  })

  it("con obligaciones tributarias (ya tiene RUT) recomienda el nivel 2", () => {
    for (const cambio of [
      { esDeclarante: true },
      { obligadoFacturar: true },
      { responsableIva: true },
    ]) {
      expect(nivelRecomendado({ ...SIN_DECLARAR, ...cambio }, 1)).toEqual({
        nivel: 2,
        motivo: "obligaciones-tributarias",
      })
    }
  })

  it("no recomienda nada sin declarar ni si ya está en ese nivel o más", () => {
    expect(nivelRecomendado(SIN_DECLARAR, 1)).toBeNull()
    expect(
      nivelRecomendado({ ...SIN_DECLARAR, esDeclarante: true }, 2)
    ).toBeNull()
    expect(
      nivelRecomendado({ ...SIN_DECLARAR, tipoDocumento: "NIT" }, 3)
    ).toBeNull()
  })

  it("explica la recomendación con el nivel que propone", () => {
    expect(
      explicacionRecomendacion({ nivel: 3, motivo: "persona-juridica" })
    ).toMatch(/NIT.*nivel 3/)
    expect(
      explicacionRecomendacion({ nivel: 2, motivo: "obligaciones-tributarias" })
    ).toMatch(/RUT.*nivel 2/)
  })
})
