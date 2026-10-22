import { describe, expect, it } from "vitest"

import {
  accionesDecision,
  cuentaElegible,
  evaluarNivel,
  situacionDecision,
} from "./decision"
import type { DocumentoRequisito, NivelRequisitos } from "./requisitos"

const HOY = "2026-10-22"

const NIVEL_1: NivelRequisitos = {
  nivel: 1,
  nombre: "Persona natural informal",
  documentosRequeridos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
}

function aprobado(tipo: DocumentoRequisito["tipo"]): DocumentoRequisito {
  return {
    id: `doc-${tipo}`,
    tipo,
    estado: "APROBADO",
    metodo: "ARCHIVO",
    venceAt: null,
    subidoAt: "2026-10-01T15:00:00.000Z",
  }
}

const COMPLETOS = [
  aprobado("CEDULA_FRENTE"),
  aprobado("CEDULA_REVERSO"),
  aprobado("PRUEBA_VIDA"),
  aprobado("CERT_BANCARIA"),
]

describe("accionesDecision", () => {
  it("sigue la máquina de estados del medio", () => {
    expect(accionesDecision("PENDIENTE")).toEqual(["verificar", "rechazar"])
    expect(accionesDecision("VERIFICADO")).toEqual(["cambiar_nivel"])
    expect(accionesDecision("RECHAZADO")).toEqual([])
    expect(accionesDecision("SUSPENDIDO")).toEqual([])
  })
})

describe("cuentaElegible", () => {
  it("la gracia sigue contando, como en private.cuenta_vigente", () => {
    expect(cuentaElegible("vigente")).toBe(true)
    expect(cuentaElegible("por_vencer")).toBe(true)
    expect(cuentaElegible("en_gracia")).toBe(true)
    expect(cuentaElegible("vencida")).toBe(false)
    expect(cuentaElegible("sin_verificar")).toBe(false)
  })
})

describe("evaluarNivel", () => {
  it("al verificar desde PENDIENTE suma la cuenta vigente como requisito", () => {
    const evaluacion = evaluarNivel({
      nivel: NIVEL_1,
      documentos: COMPLETOS,
      cuentas: [{ vigencia: "vigente" }],
      estado: "PENDIENTE",
      hoy: HOY,
    })
    expect(evaluacion).toMatchObject({
      exigeCuenta: true,
      cuentaVigente: true,
      cumplidos: 5,
      total: 5,
      listo: true,
    })
  })

  it("sin cuenta vigente no está listo aunque tenga los documentos", () => {
    const evaluacion = evaluarNivel({
      nivel: NIVEL_1,
      documentos: COMPLETOS,
      cuentas: [{ vigencia: "vencida" }],
      estado: "PENDIENTE",
      hoy: HOY,
    })
    expect(evaluacion).toMatchObject({ cumplidos: 4, total: 5, listo: false })
  })

  it("al cambiar de nivel solo cuentan los documentos", () => {
    const evaluacion = evaluarNivel({
      nivel: NIVEL_1,
      documentos: COMPLETOS,
      cuentas: [],
      estado: "VERIFICADO",
      hoy: HOY,
    })
    expect(evaluacion).toMatchObject({
      exigeCuenta: false,
      cumplidos: 4,
      total: 4,
      listo: true,
    })
  })

  it("sin acceso a los documentos no afirma que esté listo", () => {
    const sinDocumentos = {
      nivel: NIVEL_1,
      documentos: null,
      hoy: HOY,
    } as const
    expect(
      evaluarNivel({
        ...sinDocumentos,
        cuentas: [{ vigencia: "vigente" }],
        estado: "PENDIENTE",
      })
    ).toMatchObject({ requisitos: null, cumplidos: null, listo: null })
    // Lo que sí se ve (la cuenta) basta para saber que falta algo.
    expect(
      evaluarNivel({ ...sinDocumentos, cuentas: [], estado: "PENDIENTE" }).listo
    ).toBe(false)
  })
})

describe("situacionDecision", () => {
  it("distingue si el medio ya envió su perfil", () => {
    const base = { estado: "PENDIENTE", nivel: 0, motivo: null } as const
    expect(situacionDecision({ ...base, enviado: true }).titulo).toBe(
      "Espera tu decisión"
    )
    expect(situacionDecision({ ...base, enviado: false }).tono).toBe("neutro")
  })

  it("muestra el motivo del rechazo como frase completa", () => {
    expect(
      situacionDecision({
        estado: "RECHAZADO",
        nivel: 0,
        enviado: true,
        motivo: "La cédula no se lee",
      }).descripcion
    ).toMatch(/^Motivo: La cédula no se lee\. Volverá a la cola/)
  })

  it("nombra el nivel del medio verificado", () => {
    expect(
      situacionDecision({
        estado: "VERIFICADO",
        nivel: 2,
        enviado: true,
        motivo: null,
      }).titulo
    ).toBe("Verificado en el nivel 2")
  })
})
