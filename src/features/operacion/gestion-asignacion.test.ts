import { describe, expect, it } from "vitest"

import type { EstadoAsignacion } from "./estados"
import {
  admiteSuspension,
  BLOQUEO_CANCELAR_EN_DISPUTA,
  BLOQUEO_CANCELAR_LIQUIDADA,
  disputaAbierta,
  efectosCancelacion,
  efectosDisputa,
  hayGestion,
  MENSAJES_HINT_CANCELACION,
  opcionesGestion,
  ORDEN_CAUSAS,
  ORDEN_MOTIVOS_DISPUTA,
  type SituacionGestion,
} from "./gestion-asignacion"

/** ADMIN: cancela, suspende medios y abre, ve y resuelve disputas. */
const ADMIN = [
  "asignaciones.ver",
  "asignaciones.gestionar",
  "medios.suspender",
  "disputas.ver",
  "disputas.abrir",
  "disputas.resolver",
]
/** FINANZAS: consulta, sin gestión. */
const FINANZAS = ["asignaciones.ver", "disputas.ver"]

function situacion(
  estado: EstadoAsignacion,
  cambios: Partial<SituacionGestion> = {}
): SituacionGestion {
  return { estado, medioEstado: "VERIFICADO", disputas: [], ...cambios }
}

describe("opcionesGestion · cancelar (ADM-010)", () => {
  const CANCELABLES: readonly EstadoAsignacion[] = [
    "ACEPTADA",
    "CONTENIDO_ENTREGADO",
    "PUBLICADA",
    "EVIDENCIA_VALIDADA",
    "METRICAS_CARGADAS",
    "VERIFICADA",
  ]

  it.each(CANCELABLES)("%s se cancela sin bloqueo", (estado) => {
    expect(opcionesGestion(situacion(estado), ADMIN).cancelar).toEqual({
      bloqueo: null,
      suspension: "disponible",
    })
  })

  it("liquidada o pagada: se ofrece con el bloqueo «anula primero la liquidación»", () => {
    for (const estado of ["LIQUIDADA", "PAGADA"] as const) {
      expect(opcionesGestion(situacion(estado), ADMIN).cancelar?.bloqueo).toBe(
        BLOQUEO_CANCELAR_LIQUIDADA
      )
    }
    expect(BLOQUEO_CANCELAR_LIQUIDADA).toMatch(/anula primero la liquidación/)
  })

  it("en disputa: se cancela al resolverla", () => {
    const opcion = opcionesGestion(situacion("EN_DISPUTA"), ADMIN).cancelar
    expect(opcion?.bloqueo).toBe(BLOQUEO_CANCELAR_EN_DISPUTA)
    expect(BLOQUEO_CANCELAR_EN_DISPUTA).toMatch(/al resolver la disputa/)
  })

  it("cerradas: no hay nada que cancelar", () => {
    for (const estado of [
      "RECHAZADA",
      "VENCIDA_SIN_PUBLICAR",
      "CANCELADA",
    ] as const) {
      expect(opcionesGestion(situacion(estado), ADMIN).cancelar).toBeNull()
    }
  })

  it("sin `asignaciones.gestionar` no se ofrece, tampoco bloqueada", () => {
    expect(
      opcionesGestion(situacion("PUBLICADA"), FINANZAS).cancelar
    ).toBeNull()
    expect(opcionesGestion(situacion("PAGADA"), FINANZAS).cancelar).toBeNull()
  })

  it("la suspensión depende del medio y del permiso", () => {
    const sinSuspender = ADMIN.filter((p) => p !== "medios.suspender")
    expect(
      opcionesGestion(situacion("PUBLICADA"), sinSuspender).cancelar?.suspension
    ).toBe("sin_permiso")
    expect(
      opcionesGestion(
        situacion("PUBLICADA", { medioEstado: "SUSPENDIDO" }),
        ADMIN
      ).cancelar?.suspension
    ).toBe("ya_suspendido")
    expect(
      opcionesGestion(situacion("PUBLICADA", { medioEstado: null }), ADMIN)
        .cancelar?.suspension
    ).toBe("no_aplica")
  })

  it("solo el fraude y el incumplimiento del medio admiten suspender", () => {
    expect(ORDEN_CAUSAS.filter(admiteSuspension)).toEqual([
      "INCUMPLIMIENTO_MEDIO",
      "FRAUDE",
    ])
    expect(admiteSuspension(null)).toBe(false)
  })

  it("los `hint` de la BD tienen su texto", () => {
    expect(MENSAJES_HINT_CANCELACION.liquidacion_vigente).toBe(
      BLOQUEO_CANCELAR_LIQUIDADA
    )
    expect(MENSAJES_HINT_CANCELACION.en_disputa).toBe(
      BLOQUEO_CANCELAR_EN_DISPUTA
    )
  })
})

describe("opcionesGestion · disputa (ADM-011)", () => {
  it.each([
    "PUBLICADA",
    "EVIDENCIA_VALIDADA",
    "METRICAS_CARGADAS",
    "VERIFICADA",
  ] as const)("%s es disputable por el equipo", (estado) => {
    expect(opcionesGestion(situacion(estado), ADMIN).disputa).toEqual({
      tipo: "abrir",
    })
  })

  it("antes de publicar, liquidada, pagada o cerrada no se disputa", () => {
    for (const estado of [
      "ACEPTADA",
      "CONTENIDO_ENTREGADO",
      "LIQUIDADA",
      "PAGADA",
      "CANCELADA",
      "RECHAZADA",
      // Una vencida solo la reclama el medio.
      "VENCIDA_SIN_PUBLICAR",
    ] as const) {
      expect(opcionesGestion(situacion(estado), ADMIN).disputa).toBeNull()
    }
  })

  it("con una abierta enlaza a ella en lugar de abrir otra", () => {
    const conAbierta = situacion("EN_DISPUTA", {
      disputas: [
        { id: "d-vieja", estado: "DESCARTADA" },
        { id: "d-abierta", estado: "EN_REVISION" },
      ],
    })
    expect(opcionesGestion(conAbierta, ADMIN).disputa).toEqual({
      tipo: "ver",
      disputaId: "d-abierta",
    })
    expect(
      opcionesGestion(conAbierta, ["asignaciones.ver", "disputas.abrir"])
        .disputa
    ).toBeNull()
  })

  it("una disputa cerrada no impide abrir otra", () => {
    const resuelta = situacion("VERIFICADA", {
      disputas: [{ id: "d1", estado: "RESUELTA" }],
    })
    expect(opcionesGestion(resuelta, ADMIN).disputa).toEqual({ tipo: "abrir" })
    expect(disputaAbierta(resuelta.disputas)).toBeNull()
  })

  it("sin `disputas.abrir` no se ofrece abrirla", () => {
    expect(opcionesGestion(situacion("PUBLICADA"), FINANZAS).disputa).toBeNull()
    expect(hayGestion(opcionesGestion(situacion("PUBLICADA"), FINANZAS))).toBe(
      false
    )
    expect(hayGestion(opcionesGestion(situacion("PUBLICADA"), ADMIN))).toBe(
      true
    )
  })

  it("ofrece los seis motivos del catálogo", () => {
    expect(ORDEN_MOTIVOS_DISPUTA).toEqual([
      "INCUMPLIMIENTO",
      "METRICAS",
      "CONTENIDO",
      "PERMANENCIA",
      "PAGO",
      "OTRO",
    ])
  })
})

describe("efectos que se explican antes de confirmar", () => {
  it("cancelar libera cupo y presupuesto; si ya publicó, no se paga", () => {
    expect(efectosCancelacion("ACEPTADA")).toEqual([
      "Libera el cupo y el presupuesto de la oferta.",
      "El medio y el anunciante reciben un aviso con el motivo.",
      "No se puede deshacer.",
    ])
    expect(efectosCancelacion("METRICAS_CARGADAS")).toContain(
      "El medio ya publicó, pero no recibe el pago de esta asignación."
    )
    expect(efectosCancelacion("VERIFICADA").join(" ")).toMatch(
      /no entrará en ninguna liquidación/
    )
  })

  it("abrir una disputa congela la asignación; por permanencia, marca el retiro", () => {
    expect(efectosDisputa(null)).toHaveLength(2)
    expect(efectosDisputa("PERMANENCIA")).toContain(
      "La publicación queda marcada como retirada."
    )
  })
})
