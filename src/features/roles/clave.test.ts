import { describe, expect, it } from "vitest"

import {
  derivarClave,
  esClaveDeSistema,
  LONGITUD_MAXIMA_CLAVE,
  normalizarClave,
  PATRON_CLAVE_ROL,
} from "./clave"

describe("derivarClave", () => {
  it("pasa el nombre a MAYÚSCULAS_CON_GUION_BAJO sin tildes ni eñes", () => {
    expect(derivarClave("Analista de campañas")).toBe("ANALISTA_DE_CAMPANAS")
    expect(derivarClave("  Soporte — Medios / Región Caribe ")).toBe(
      "SOPORTE_MEDIOS_REGION_CARIBE"
    )
  })

  it("antepone ROL_ si el nombre empieza por un número", () => {
    expect(derivarClave("2.º nivel")).toBe("ROL_2_NIVEL")
  })

  it("devuelve vacío si no queda ningún carácter válido", () => {
    expect(derivarClave("  ¡¿?!  ")).toBe("")
  })

  it("recorta a 40 caracteres sin dejar un guion bajo al final", () => {
    const clave = derivarClave(`${"a".repeat(39)} b`)
    expect(clave.length).toBeLessThanOrEqual(LONGITUD_MAXIMA_CLAVE)
    expect(clave.endsWith("_")).toBe(false)
    expect(clave).toMatch(PATRON_CLAVE_ROL)
  })

  it("produce claves que cumplen el CHECK de la BD", () => {
    for (const nombre of ["Finanzas junior", "Mesa de ayuda", "Ñandú 2026"]) {
      expect(derivarClave(nombre)).toMatch(PATRON_CLAVE_ROL)
    }
  })
})

describe("normalizarClave", () => {
  it("lleva lo tecleado al formato permitido mientras se escribe", () => {
    expect(normalizarClave("analista-campañas 2")).toBe("ANALISTA_CAMPANAS_2")
    expect(normalizarClave("rol.$especial")).toBe("ROLESPECIAL")
  })

  it("no supera la longitud máxima", () => {
    expect(normalizarClave("x".repeat(60))).toHaveLength(LONGITUD_MAXIMA_CLAVE)
  })
})

describe("esClaveDeSistema", () => {
  it("reconoce las claves reservadas de los roles de sistema", () => {
    expect(esClaveDeSistema("SUPERADMIN")).toBe(true)
    expect(esClaveDeSistema("FINANZAS")).toBe(true)
    expect(esClaveDeSistema("FINANZAS_JUNIOR")).toBe(false)
  })
})
