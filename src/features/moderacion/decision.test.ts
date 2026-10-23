import { describe, expect, it } from "vitest"

import {
  BLOQUEO_FECHA_LIMITE,
  bloqueoCancelacionInterna,
  decisionesDisponibles,
} from "./decision"

const MODERADOR = ["ofertas.ver", "ofertas.moderar", "ofertas.gestionar"]
const LIBRE = { fechaLimiteVencida: false, cuposOcupados: 0 }

describe("decisionesDisponibles", () => {
  it("en revisión: publicar, devolver y rechazar (estos dos con motivo)", () => {
    expect(decisionesDisponibles("EN_REVISION", MODERADOR, LIBRE)).toEqual([
      { decision: "publicar", requiereMotivo: false, bloqueo: null },
      { decision: "devolver", requiereMotivo: true, bloqueo: null },
      { decision: "rechazar", requiereMotivo: true, bloqueo: null },
    ])
  })

  it("con la fecha límite vencida, publicar queda bloqueado y explicado", () => {
    const publicar = decisionesDisponibles("EN_REVISION", MODERADOR, {
      ...LIBRE,
      fechaLimiteVencida: true,
    }).find((opcion) => opcion.decision === "publicar")
    expect(publicar?.bloqueo).toBe(BLOQUEO_FECHA_LIMITE)
  })

  it("publicada: solo cancelar, con motivo", () => {
    expect(decisionesDisponibles("PUBLICADA", MODERADOR, LIBRE)).toEqual([
      { decision: "cancelar", requiereMotivo: true, bloqueo: null },
    ])
  })

  it("publicada con cupos tomados: cancelar se explica como bloqueado", () => {
    const [cancelar] = decisionesDisponibles("PUBLICADA", MODERADOR, {
      ...LIBRE,
      cuposOcupados: 3,
    })
    expect(cancelar.bloqueo).toMatch(/hay 3 cupos tomados/)
  })

  it("las transiciones del modo asistido no son decisiones de moderación", () => {
    // Con `ofertas.gestionar` la BD permite retirar de revisión o reenviar.
    expect(decisionesDisponibles("DEVUELTA", MODERADOR, LIBRE)).toEqual([])
    expect(decisionesDisponibles("BORRADOR", MODERADOR, LIBRE)).toEqual([])
  })

  it("sin `ofertas.moderar` no hay decisiones", () => {
    expect(
      decisionesDisponibles("EN_REVISION", ["ofertas.ver"], LIBRE)
    ).toEqual([])
  })

  it("estados terminales no ofrecen nada", () => {
    for (const estado of ["CANCELADA", "CERRADA", "VENCIDA"] as const) {
      expect(decisionesDisponibles(estado, MODERADOR, LIBRE)).toEqual([])
    }
  })
})

describe("bloqueoCancelacionInterna", () => {
  it("sin cupos tomados no bloquea; con uno, en singular", () => {
    expect(bloqueoCancelacionInterna(0)).toBeNull()
    expect(bloqueoCancelacionInterna(1)).toMatch(/^Ya hay 1 cupo tomado:/)
  })
})
