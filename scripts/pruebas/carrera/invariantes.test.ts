import { describe, expect, it } from "vitest"

import {
  type AsignacionFila,
  codigoDeError,
  consumeCupo,
  erroresInesperados,
  estadoEsperadoOferta,
  type Instantanea,
  type OfertaFila,
  resumirRafaga,
  sessionIdDeToken,
  verificarInvariantes,
} from "./invariantes"

const AHORA = Date.parse("2026-10-01T12:00:00Z")
const FUTURO = "2026-10-05T00:00:00Z"
const PRECIO = 250_000

function oferta(cambios: Partial<OfertaFila> = {}): OfertaFila {
  return {
    id: "o1",
    estado: "CUPOS_COMPLETOS",
    presupuesto_maximo: 3 * PRECIO,
    presupuesto_comprometido: 3 * PRECIO,
    cupos_totales: 3,
    cupos_ocupados: 3,
    tope_porcentaje_por_medio: 0.34,
    ventana_inicio: FUTURO,
    fecha_limite_aceptacion: FUTURO,
    ...cambios,
  }
}

function asignacion(
  id: string,
  cambios: Partial<AsignacionFila> = {}
): AsignacionFila {
  return {
    id,
    oferta_id: "o1",
    medio_id: `m-${id}`,
    franja_id: "f1",
    estado: "ACEPTADA",
    estado_previo_disputa: null,
    monto_bruto: PRECIO,
    aceptada_at: "2026-10-01T11:59:00Z",
    ...cambios,
  }
}

function instantanea(cambios: Partial<Instantanea> = {}): Instantanea {
  const asignaciones = ["a1", "a2", "a3"].map((id) => asignacion(id))
  return {
    campana: {
      id: "c1",
      presupuesto_total: 3 * PRECIO,
      presupuesto_comprometido: 3 * PRECIO,
    },
    ofertas: [oferta()],
    cupos: [
      { oferta_id: "o1", franja_id: "f1", cupos_totales: 3, cupos_ocupados: 3 },
    ],
    asignaciones,
    montos: asignaciones.map((a) => a.id),
    leidaEn: AHORA,
    ...cambios,
  }
}

describe("consumeCupo", () => {
  it("replica el predicado SQL, incluida la disputa de una vencida", () => {
    expect(consumeCupo("ACEPTADA", null)).toBe(true)
    expect(consumeCupo("RECHAZADA", null)).toBe(false)
    expect(consumeCupo("EN_DISPUTA", "PUBLICADA")).toBe(true)
    expect(consumeCupo("EN_DISPUTA", "VENCIDA_SIN_PUBLICAR")).toBe(false)
  })
})

describe("resumirRafaga", () => {
  it("cuenta éxitos, ids distintos, errores por código y deadlocks", () => {
    const resumen = resumirRafaga([
      { asignacionId: "a1", error: null },
      { asignacionId: "a1", error: null },
      { asignacionId: null, error: { code: "P0001", message: "AMO_SIN_CUPO" } },
      {
        asignacionId: null,
        error: { code: "40P01", message: "deadlock detected" },
      },
    ])
    expect(resumen).toEqual({
      exitos: 2,
      asignaciones: ["a1"],
      errores: { AMO_SIN_CUPO: 1, SQLSTATE_40P01: 1 },
      deadlocks: 1,
    })
    expect(erroresInesperados(resumen, ["AMO_SIN_CUPO"])).toEqual([
      "SQLSTATE_40P01",
    ])
  })

  it("distingue los errores de negocio del resto por SQLSTATE", () => {
    expect(codigoDeError({ code: "P0001", message: "AMO_TOPE_MEDIO" })).toBe(
      "AMO_TOPE_MEDIO"
    )
    expect(codigoDeError({ code: "55P03", message: "lock timeout" })).toBe(
      "SQLSTATE_55P03"
    )
  })
})

describe("verificarInvariantes", () => {
  it("acepta una oferta llena con contadores coherentes", () => {
    expect(verificarInvariantes(instantanea())).toEqual([])
  })

  it("detecta contadores que no cuadran con las asignaciones", () => {
    const fallas = verificarInvariantes(
      instantanea({
        cupos: [
          {
            oferta_id: "o1",
            franja_id: "f1",
            cupos_totales: 3,
            cupos_ocupados: 2,
          },
        ],
      })
    )
    expect(fallas.some((f) => f.includes("cupos_ocupados = 2"))).toBe(true)
  })

  it("detecta presupuesto comprometido distinto de la suma de brutos", () => {
    const fallas = verificarInvariantes(
      instantanea({
        campana: {
          id: "c1",
          presupuesto_total: 3 * PRECIO,
          presupuesto_comprometido: 2 * PRECIO,
        },
      })
    )
    expect(fallas).toContain(
      `campanas.presupuesto_comprometido = ${2 * PRECIO}, Σ monto_bruto = ${3 * PRECIO}`
    )
  })

  it("ignora las asignaciones que ya no ocupan cupo", () => {
    const asignaciones = [
      ...["a1", "a2", "a3"].map((id) => asignacion(id)),
      asignacion("a4", { estado: "RECHAZADA" }),
    ]
    expect(
      verificarInvariantes(
        instantanea({ asignaciones, montos: asignaciones.map((a) => a.id) })
      )
    ).toEqual([])
  })

  it("detecta un medio por encima del tope de la campaña", () => {
    const asignaciones = ["a1", "a2", "a3"].map((id) =>
      asignacion(id, { medio_id: "m1" })
    )
    const fallas = verificarInvariantes(
      instantanea({ asignaciones, montos: asignaciones.map((a) => a.id) })
    )
    expect(fallas.some((f) => f.startsWith("medio m1"))).toBe(true)
  })

  it("exige la fila de montos de toda asignación aceptada", () => {
    expect(
      verificarInvariantes(instantanea({ montos: ["a1", "a2"] }))
    ).toContain("asignación a3 aceptada sin fila en asignacion_montos")
  })
})

describe("estadoEsperadoOferta", () => {
  it("espera CUPOS_COMPLETOS si se llenó antes de la ventana y PUBLICADA si se liberó un cupo", () => {
    expect(estadoEsperadoOferta(oferta(), AHORA)).toBe("CUPOS_COMPLETOS")
    expect(
      estadoEsperadoOferta(
        oferta({ cupos_ocupados: 2, estado: "PUBLICADA" }),
        AHORA
      )
    ).toBe("PUBLICADA")
  })

  it("no opina sobre ofertas en otros estados o con la ventana iniciada", () => {
    expect(
      estadoEsperadoOferta(oferta({ estado: "EN_EJECUCION" }), AHORA)
    ).toBeNull()
    expect(
      estadoEsperadoOferta(
        oferta({ ventana_inicio: "2026-09-01T00:00:00Z" }),
        AHORA
      )
    ).toBeNull()
  })
})

describe("sessionIdDeToken", () => {
  it("lee session_id de la carga del JWT", () => {
    const carga = Buffer.from(
      JSON.stringify({ session_id: "s-1", aal: "aal1" })
    ).toString("base64url")
    expect(sessionIdDeToken(`h.${carga}.f`)).toBe("s-1")
  })

  it("rechaza tokens sin session_id o mal formados", () => {
    const carga = Buffer.from(JSON.stringify({ sub: "u" })).toString(
      "base64url"
    )
    expect(() => sessionIdDeToken(`h.${carga}.f`)).toThrow("session_id")
    expect(() => sessionIdDeToken("no-es-jwt")).toThrow("JWT")
  })
})
