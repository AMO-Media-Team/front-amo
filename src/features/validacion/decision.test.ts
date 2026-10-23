import { describe, expect, it } from "vitest"

import type {
  Corte,
  EstadoAsignacion,
  EstadoValidacion,
} from "@/features/operacion/estados"
import type { CorteMetrica } from "@/features/operacion/metricas"

import {
  type AccionesCorte,
  accionesCorte,
  BLOQUEO_EVIDENCIA_SIN_APROBAR,
  bloqueoEnCola,
  detalleFaltanMetricas,
  enCurso,
  evidenciaEnDisputa,
  evidenciaEsperaDisputa,
  frasePermanenciaPendiente,
  puedeValidarEvidencia,
  rechazoMetricaEnDisputa,
  situacionVerificacion,
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

/** La ficha de una asignación en `estado`, sin disputas. */
function ficha(
  permisos: readonly string[],
  estado: EstadoAsignacion,
  cambios: Partial<Parameters<typeof validacionEnFicha>[1]> = {}
) {
  return validacionEnFicha(permisos, {
    estado,
    estadoPrevioDisputa: null,
    disputas: [],
    ...cambios,
  })
}

const SIN_ACCIONES: AccionesCorte = {
  validar: false,
  bloqueoAprobar: null,
  rechazoEnDisputa: false,
  corregir: false,
}

describe("decisiones de la ficha", () => {
  it("solo se valida en una asignación en curso", () => {
    expect(enCurso("PUBLICADA")).toBe(true)
    expect(enCurso("EN_DISPUTA")).toBe(true)
    expect(enCurso("CANCELADA")).toBe(false)
    expect(enCurso("VERIFICADA")).toBe(false)
  })

  it("una evidencia pendiente se valida con el permiso y la asignación en curso", () => {
    const publicada = ficha(OPERACIONES, "PUBLICADA")
    expect(puedeValidarEvidencia("PENDIENTE", publicada)).toBe(true)
    expect(puedeValidarEvidencia("APROBADA", publicada)).toBe(false)
    expect(puedeValidarEvidencia("PENDIENTE", undefined)).toBe(false)
    expect(
      puedeValidarEvidencia(
        "PENDIENTE",
        ficha(["metricas.validar"], "PUBLICADA")
      )
    ).toBe(false)
    expect(
      puedeValidarEvidencia(
        "PENDIENTE",
        ficha(OPERACIONES, "VENCIDA_SIN_PUBLICAR")
      )
    ).toBe(false)
  })

  it("un corte pendiente no se aprueba sin la evidencia aprobada (se explica)", () => {
    const evidenciaValidada = ficha(OPERACIONES, "EVIDENCIA_VALIDADA")
    expect(
      accionesCorte({ estado: "PENDIENTE" }, false, evidenciaValidada)
    ).toEqual({
      ...SIN_ACCIONES,
      validar: true,
      bloqueoAprobar: BLOQUEO_EVIDENCIA_SIN_APROBAR,
    })
    expect(
      accionesCorte({ estado: "PENDIENTE" }, true, evidenciaValidada)
    ).toEqual({ ...SIN_ACCIONES, validar: true })
  })

  it("corregir una aprobada es solo de quien corrige métricas validadas", () => {
    expect(
      accionesCorte(
        { estado: "APROBADA" },
        true,
        ficha(OPERACIONES, "VERIFICADA")
      ).corregir
    ).toBe(false)
    expect(
      accionesCorte({ estado: "APROBADA" }, true, ficha(ADMIN, "VERIFICADA"))
    ).toEqual({ ...SIN_ACCIONES, corregir: true })
    expect(accionesCorte({ estado: "APROBADA" }, true, undefined)).toEqual(
      SIN_ACCIONES
    )
  })

  it("enlaza a la disputa abierta solo con `disputas.ver`", () => {
    const disputas = [
      { id: "d-cerrada", estado: "RESUELTA" as const },
      { id: "d-abierta", estado: "EN_REVISION" as const },
    ]
    expect(
      ficha([...OPERACIONES, "disputas.ver"], "EN_DISPUTA", {
        estadoPrevioDisputa: "PUBLICADA",
        disputas,
      })
    ).toMatchObject({
      estadoAsignacion: "EN_DISPUTA",
      estadoPrevioDisputa: "PUBLICADA",
      disputaId: "d-abierta",
    })
    expect(ficha(OPERACIONES, "EN_DISPUTA", { disputas }).disputaId).toBeNull()
    expect(
      ficha([...OPERACIONES, "disputas.ver"], "VERIFICADA", {
        disputas: [disputas[0]],
      }).disputaId
    ).toBeNull()
  })
})

describe("durante una disputa (hint `en_disputa`)", () => {
  it("la evidencia pendiente espera a la disputa: no se ofrece decidirla, se explica", () => {
    const enDisputa = ficha(OPERACIONES, "EN_DISPUTA", {
      estadoPrevioDisputa: "PUBLICADA",
    })
    expect(evidenciaEnDisputa("EN_DISPUTA")).toBe(true)
    expect(evidenciaEnDisputa("PUBLICADA")).toBe(false)
    expect(puedeValidarEvidencia("PENDIENTE", enDisputa)).toBe(false)
    expect(evidenciaEsperaDisputa("PENDIENTE", enDisputa)).toBe(true)
    expect(evidenciaEsperaDisputa("APROBADA", enDisputa)).toBe(false)
    // Sin el permiso no hay nada que explicar.
    expect(
      evidenciaEsperaDisputa(
        "PENDIENTE",
        ficha(["metricas.validar"], "EN_DISPUTA")
      )
    ).toBe(false)
    expect(
      evidenciaEsperaDisputa("PENDIENTE", ficha(OPERACIONES, "PUBLICADA"))
    ).toBe(false)
  })

  it("con todo cargado, el rechazo de una métrica espera; aprobarla sigue", () => {
    const conTodo = ficha(OPERACIONES, "EN_DISPUTA", {
      estadoPrevioDisputa: "METRICAS_CARGADAS",
    })
    expect(accionesCorte({ estado: "PENDIENTE" }, true, conTodo)).toEqual({
      ...SIN_ACCIONES,
      validar: true,
      rechazoEnDisputa: true,
    })
    expect(
      rechazoMetricaEnDisputa({
        estadoAsignacion: "EN_DISPUTA",
        estadoPrevioDisputa: "EVIDENCIA_VALIDADA",
      })
    ).toBe(false)
    expect(
      accionesCorte(
        { estado: "PENDIENTE" },
        true,
        ficha(OPERACIONES, "EN_DISPUTA", {
          estadoPrevioDisputa: "EVIDENCIA_VALIDADA",
        })
      ).rechazoEnDisputa
    ).toBe(false)
    expect(
      accionesCorte({ estado: "APROBADA" }, true, conTodo).rechazoEnDisputa
    ).toBe(false)
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
