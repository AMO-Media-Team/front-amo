import { describe, expect, it } from "vitest"

import type { Corte, EstadoValidacion } from "@/features/operacion/estados"
import type { CorteMetrica } from "@/features/operacion/metricas"

import {
  accionesCorte,
  BLOQUEO_EVIDENCIA_SIN_APROBAR,
  bloqueoEnCola,
  detalleFaltanMetricas,
  enCurso,
  puedeValidarEvidencia,
  situacionVerificacion,
  frasePermanenciaPendiente,
  validacionEnFicha,
} from "./decision"

const AHORA = new Date("2026-10-23T15:00:00Z")
const AYER = "2026-10-22T15:00:00Z"
const MANANA = "2026-10-24T15:00:00Z"
const PASADO = "2026-10-26T15:00:00Z"

const OPERACIONES = ["evidencias.validar", "metricas.validar"]
const ADMIN = [...OPERACIONES, "metricas.editar_validadas"]

function corte(corte: Corte, estado: EstadoValidacion): CorteMetrica {
  return { corte, estado } as CorteMetrica
}

function publicacion(
  cortes: CorteMetrica[],
  {
    permanenciaHasta = AYER,
    permanenciaVerificadaAt = null,
  }: { permanenciaHasta?: string; permanenciaVerificadaAt?: string | null } = {}
) {
  return { cortes, permanenciaHasta, permanenciaVerificadaAt }
}

describe("decisiones de la ficha", () => {
  it("solo se valida en una asignación en curso", () => {
    expect(enCurso("PUBLICADA")).toBe(true)
    expect(enCurso("EN_DISPUTA")).toBe(true)
    expect(enCurso("CANCELADA")).toBe(false)
    expect(enCurso("VERIFICADA")).toBe(false)
  })

  it("una evidencia pendiente se valida con el permiso y la asignación en curso", () => {
    const ficha = validacionEnFicha(OPERACIONES, "PUBLICADA")
    expect(puedeValidarEvidencia("PENDIENTE", ficha)).toBe(true)
    expect(puedeValidarEvidencia("APROBADA", ficha)).toBe(false)
    expect(puedeValidarEvidencia("PENDIENTE", undefined)).toBe(false)
    expect(
      puedeValidarEvidencia(
        "PENDIENTE",
        validacionEnFicha(["metricas.validar"], "PUBLICADA")
      )
    ).toBe(false)
    expect(
      puedeValidarEvidencia(
        "PENDIENTE",
        validacionEnFicha(OPERACIONES, "VENCIDA_SIN_PUBLICAR")
      )
    ).toBe(false)
  })

  it("un corte pendiente no se aprueba sin la evidencia aprobada (se explica)", () => {
    const ficha = validacionEnFicha(OPERACIONES, "EVIDENCIA_VALIDADA")
    expect(accionesCorte({ estado: "PENDIENTE" }, false, ficha)).toEqual({
      validar: true,
      bloqueoAprobar: BLOQUEO_EVIDENCIA_SIN_APROBAR,
      corregir: false,
    })
    expect(accionesCorte({ estado: "PENDIENTE" }, true, ficha)).toEqual({
      validar: true,
      bloqueoAprobar: null,
      corregir: false,
    })
  })

  it("corregir una aprobada es solo de quien corrige métricas validadas", () => {
    expect(
      accionesCorte(
        { estado: "APROBADA" },
        true,
        validacionEnFicha(OPERACIONES, "VERIFICADA")
      ).corregir
    ).toBe(false)
    expect(
      accionesCorte(
        { estado: "APROBADA" },
        true,
        validacionEnFicha(ADMIN, "VERIFICADA")
      )
    ).toEqual({ validar: false, bloqueoAprobar: null, corregir: true })
    expect(accionesCorte({ estado: "APROBADA" }, true, undefined)).toEqual({
      validar: false,
      bloqueoAprobar: null,
      corregir: false,
    })
  })
})

describe("situacionVerificacion (ADM-009)", () => {
  const base = {
    estado: "METRICAS_CARGADAS" as const,
    cortesRequeridos: ["H24", "H72"] as Corte[],
    puedeVerificar: true,
    puedeConstanciaManual: false,
    ahora: AHORA,
  }

  it("lista con todos los cortes aprobados y la permanencia cumplida", () => {
    expect(
      situacionVerificacion({
        ...base,
        publicaciones: [
          publicacion([corte("H24", "APROBADA"), corte("H72", "APROBADA")]),
        ],
      })
    ).toEqual({ tipo: "lista" })
  })

  it("no aplica fuera de «Métricas cargadas» ni sin permiso", () => {
    const publicaciones = [publicacion([corte("H24", "APROBADA")])]
    expect(
      situacionVerificacion({ ...base, estado: "VERIFICADA", publicaciones })
    ).toEqual({ tipo: "no-aplica" })
    expect(
      situacionVerificacion({ ...base, puedeVerificar: false, publicaciones })
    ).toEqual({ tipo: "no-aplica" })
  })

  it("faltan métricas: cortes sin aprobar y pendientes (también un personalizado)", () => {
    const situacion = situacionVerificacion({
      ...base,
      publicaciones: [
        publicacion([
          corte("H24", "APROBADA"),
          corte("H72", "PENDIENTE"),
          corte("PERSONALIZADO", "PENDIENTE"),
        ]),
      ],
    })
    expect(situacion).toEqual({
      tipo: "bloqueada",
      motivos: [
        "Faltan métricas por aprobar: 1 corte sin aprobar y 2 métricas pendientes de revisión.",
      ],
      permanenciaHasta: null,
      constancia: false,
    })
  })

  it("permanencia pendiente hasta la fecha más lejana (criterio ADM-009 c1)", () => {
    const situacion = situacionVerificacion({
      ...base,
      puedeConstanciaManual: true,
      publicaciones: [
        publicacion([corte("H24", "APROBADA"), corte("H72", "APROBADA")], {
          permanenciaHasta: MANANA,
        }),
        publicacion([corte("H24", "APROBADA"), corte("H72", "APROBADA")], {
          permanenciaHasta: PASADO,
        }),
      ],
    })
    expect(situacion).toEqual({
      tipo: "bloqueada",
      motivos: [frasePermanenciaPendiente(PASADO)],
      permanenciaHasta: PASADO,
      constancia: true,
    })
  })

  it("una permanencia ya comprobada no bloquea", () => {
    expect(
      situacionVerificacion({
        ...base,
        cortesRequeridos: ["H24"],
        publicaciones: [
          publicacion([corte("H24", "APROBADA")], {
            permanenciaHasta: MANANA,
            permanenciaVerificadaAt: AYER,
          }),
        ],
      })
    ).toEqual({ tipo: "lista" })
  })

  it("sin constancia manual si también faltan métricas", () => {
    const situacion = situacionVerificacion({
      ...base,
      puedeConstanciaManual: true,
      cortesRequeridos: ["H24"],
      publicaciones: [
        publicacion([corte("H24", "RECHAZADA")], { permanenciaHasta: MANANA }),
      ],
    })
    expect(situacion).toMatchObject({
      tipo: "bloqueada",
      constancia: false,
      permanenciaHasta: MANANA,
    })
    expect(situacion.tipo === "bloqueada" && situacion.motivos).toHaveLength(2)
  })
})

describe("bloqueos de la cola de verificación", () => {
  it("explica qué falta con las cifras de la cola", () => {
    expect(
      bloqueoEnCola({
        bloqueo: "METRICAS",
        cortesRequeridos: 3,
        cortesAprobados: 2,
        metricasPendientes: 1,
        permanenciaHasta: null,
      })
    ).toBe(
      "Faltan métricas por aprobar: 1 corte sin aprobar y 1 métrica pendiente de revisión."
    )
    expect(
      bloqueoEnCola({
        bloqueo: "PERMANENCIA",
        cortesRequeridos: 1,
        cortesAprobados: 1,
        metricasPendientes: 0,
        permanenciaHasta: MANANA,
      })
    ).toBe(frasePermanenciaPendiente(MANANA))
    expect(
      bloqueoEnCola({
        bloqueo: null,
        cortesRequeridos: 1,
        cortesAprobados: 1,
        metricasPendientes: 0,
        permanenciaHasta: null,
      })
    ).toBeNull()
  })

  it("el detalle de lo que falta se arma en plural o singular", () => {
    expect(detalleFaltanMetricas(2, 0)).toBe(
      "Faltan métricas por aprobar: 2 cortes sin aprobar."
    )
    expect(detalleFaltanMetricas(0, 0)).toBe("Faltan métricas por aprobar.")
  })
})
