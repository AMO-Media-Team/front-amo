import { describe, expect, it } from "vitest"

import { type FilaReputacion, reputacionDesdeRpc } from "./adaptador"

function fila(parcial: Partial<FilaReputacion> = {}): FilaReputacion {
  return {
    tasa: 0.75,
    n: 4,
    cumplidas: 3,
    n_minimo: 3,
    publicaciones_total: 12,
    publicaciones_180d: 5,
    calculada_at: "2026-10-24T15:00:00+00:00",
    casos: [
      {
        asignacion_id: "a1",
        oferta: "Temporada navideña",
        limite: "2026-10-20T23:59:00-05:00",
        estado: "VERIFICADA",
        cumplida: true,
      },
    ],
    ...parcial,
  }
}

describe("reputacionDesdeRpc", () => {
  it("sin fila (la cuenta no tiene medio visible) devuelve null", () => {
    expect(reputacionDesdeRpc(undefined)).toBeNull()
  })

  it("adapta la fila a la forma de la página", () => {
    expect(reputacionDesdeRpc(fila())).toEqual({
      tasa: 0.75,
      n: 4,
      cumplidas: 3,
      nMinimo: 3,
      publicacionesTotal: 12,
      publicaciones180d: 5,
      calculadaAt: "2026-10-24T15:00:00+00:00",
      casos: [
        {
          asignacionId: "a1",
          oferta: "Temporada navideña",
          limite: "2026-10-20T23:59:00-05:00",
          estado: "VERIFICADA",
          cumplida: true,
        },
      ],
    })
  })

  it("acepta los numeric como texto y deja la tasa en null bajo el mínimo", () => {
    const reputacion = reputacionDesdeRpc(
      fila({
        tasa: null as unknown as number,
        n: "2" as unknown as number,
        cumplidas: "2" as unknown as number,
      })
    )
    expect(reputacion).toMatchObject({ tasa: null, n: 2, cumplidas: 2 })
    expect(
      reputacionDesdeRpc(fila({ tasa: "0.6667" as unknown as number }))?.tasa
    ).toBe(0.6667)
  })

  it("sin mínimo legible usa el sembrado (3)", () => {
    expect(
      reputacionDesdeRpc(fila({ n_minimo: null as unknown as number }))?.nMinimo
    ).toBe(3)
  })

  it("descarta un caso mal formado sin perder los demás y limpia el título", () => {
    const reputacion = reputacionDesdeRpc(
      fila({
        casos: [
          { asignacion_id: "a1", limite: "2026-10-01", cumplida: true },
          {
            asignacion_id: "a2",
            oferta: "   ",
            limite: "2026-09-01T12:00:00-05:00",
            estado: "VENCIDA_SIN_PUBLICAR",
            cumplida: false,
          },
        ],
      })
    )
    expect(reputacion?.casos).toEqual([
      {
        asignacionId: "a2",
        oferta: null,
        limite: "2026-09-01T12:00:00-05:00",
        estado: "VENCIDA_SIN_PUBLICAR",
        cumplida: false,
      },
    ])
    expect(reputacionDesdeRpc(fila({ casos: null }))?.casos).toEqual([])
  })
})
