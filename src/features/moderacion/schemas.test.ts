import { describe, expect, it } from "vitest"

import {
  esquemaCancelacion,
  esquemaDecision,
  esquemaDecisionConMotivo,
} from "./schemas"

const ID = "0192f3a4-5b6c-7d8e-9f01-000000000001"
/** Como lo entrega PostgREST: con microsegundos y desfase. */
const ENVIADA = "2026-10-21T15:04:05.123456+00:00"

describe("esquemas de moderación", () => {
  it("publicar lleva la oferta y el envío que mostró la ficha, sin tocarlo", () => {
    expect(esquemaDecision.parse({ ofertaId: ID, enviadaAt: ENVIADA })).toEqual(
      { ofertaId: ID, enviadaAt: ENVIADA }
    )
    // Una oferta cargada sin fecha de envío se decide con `null`.
    expect(
      esquemaDecision.safeParse({ ofertaId: ID, enviadaAt: null }).success
    ).toBe(true)
    expect(
      esquemaDecision.safeParse({ ofertaId: "123", enviadaAt: ENVIADA }).success
    ).toBe(false)
  })

  it("decidir sobre una oferta en revisión exige el envío revisado", () => {
    expect(esquemaDecision.safeParse({ ofertaId: ID }).success).toBe(false)
    expect(
      esquemaDecision.safeParse({ ofertaId: ID, enviadaAt: "ayer" }).success
    ).toBe(false)
    expect(
      esquemaDecisionConMotivo.safeParse({
        ofertaId: ID,
        motivo: "El enlace no abre.",
      }).success
    ).toBe(false)
  })

  it("devolver, rechazar y cancelar exigen un motivo con sentido", () => {
    expect(
      esquemaDecisionConMotivo.parse({
        ofertaId: ID,
        enviadaAt: ENVIADA,
        motivo: "  El enlace no abre.  ",
      })
    ).toEqual({
      ofertaId: ID,
      enviadaAt: ENVIADA,
      motivo: "El enlace no abre.",
    })

    const vacio = esquemaDecisionConMotivo.safeParse({
      ofertaId: ID,
      enviadaAt: ENVIADA,
      motivo: "   ",
    })
    expect(vacio.success).toBe(false)
    expect(vacio.error?.issues[0]?.path).toEqual(["motivo"])
    expect(
      esquemaCancelacion.safeParse({
        ofertaId: ID,
        motivo: "x".repeat(501),
      }).success
    ).toBe(false)
  })

  it("cancelar una publicada no depende del envío", () => {
    expect(
      esquemaCancelacion.parse({
        ofertaId: ID,
        motivo: "Lo solicitó el anunciante.",
      })
    ).toEqual({ ofertaId: ID, motivo: "Lo solicitó el anunciante." })
  })
})
