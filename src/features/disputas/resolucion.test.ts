import { describe, expect, it } from "vitest"

import {
  BLOQUEO_METRICAS,
  BLOQUEO_OFERTA_CERRADA,
  BLOQUEO_PENDIENTES,
  type ContextoResolucion,
  decisionesDisputa,
  opcionesResolucion,
  situacionVerificacion,
} from "./resolucion"

const AHORA = new Date("2026-10-23T15:00:00Z")
const RESOLUTOR = ["disputas.ver", "disputas.resolver"]

const SIN_BLOQUEOS = {
  faltanMetricas: false,
  metricasPendientes: false,
  permanenciaHasta: null,
}

function contexto(
  cambios: Partial<ContextoResolucion> = {}
): ContextoResolucion {
  return {
    estadoPrevio: "METRICAS_CARGADAS",
    ofertaCerrada: false,
    verificacion: SIN_BLOQUEOS,
    puedeVerificar: true,
    puedeConstanciaManual: false,
    plazoRecargaHoras: 24,
    ...cambios,
  }
}

describe("decisionesDisputa", () => {
  it("abierta: tomar en revisión, resolver o descartar", () => {
    expect(decisionesDisputa("ABIERTA", RESOLUTOR)).toEqual([
      { decision: "tomar", requiereMotivo: false },
      { decision: "resolver", requiereMotivo: true },
      { decision: "descartar", requiereMotivo: true },
    ])
  })

  it("en revisión: resolver o descartar; cerrada: nada", () => {
    expect(
      decisionesDisputa("EN_REVISION", RESOLUTOR).map((o) => o.decision)
    ).toEqual(["resolver", "descartar"])
    expect(decisionesDisputa("RESUELTA", RESOLUTOR)).toEqual([])
    expect(decisionesDisputa("DESCARTADA", RESOLUTOR)).toEqual([])
  })

  it("sin `disputas.resolver` (FINANZAS) no hay decisiones", () => {
    expect(decisionesDisputa("ABIERTA", ["disputas.ver"])).toEqual([])
  })
})

describe("situacionVerificacion", () => {
  const publicacion = {
    id: "p1",
    permanenciaHasta: "2026-10-20T15:00:00Z",
    permanenciaVerificadaAt: null,
  }

  it("lista para verificar con los cortes requeridos aprobados", () => {
    expect(
      situacionVerificacion(
        {
          publicacionesEsperadas: 1,
          cortesRequeridos: ["H24", "D7"],
          publicaciones: [publicacion],
          metricas: [
            { publicacionId: "p1", corte: "H24", estado: "APROBADA" },
            { publicacionId: "p1", corte: "D7", estado: "APROBADA" },
          ],
        },
        AHORA
      )
    ).toEqual(SIN_BLOQUEOS)
  })

  it("detecta cortes sin aprobar, pendientes y publicaciones que faltan", () => {
    const situacion = situacionVerificacion(
      {
        publicacionesEsperadas: 2,
        cortesRequeridos: ["H24"],
        publicaciones: [publicacion],
        metricas: [{ publicacionId: "p1", corte: "H24", estado: "PENDIENTE" }],
      },
      AHORA
    )
    expect(situacion.faltanMetricas).toBe(true)
    expect(situacion.metricasPendientes).toBe(true)
  })

  it("la permanencia pendiente es la última que falta por cumplirse", () => {
    const situacion = situacionVerificacion(
      {
        publicacionesEsperadas: 2,
        cortesRequeridos: [],
        publicaciones: [
          { ...publicacion, permanenciaHasta: "2026-10-25T15:00:00Z" },
          {
            id: "p2",
            permanenciaHasta: "2026-10-28T15:00:00Z",
            permanenciaVerificadaAt: null,
          },
          {
            id: "p3",
            permanenciaHasta: "2026-10-30T15:00:00Z",
            permanenciaVerificadaAt: "2026-10-22T15:00:00Z",
          },
        ],
        metricas: [],
      },
      AHORA
    )
    expect(situacion.permanenciaHasta).toBe("2026-10-28T15:00:00Z")
  })
})

describe("opcionesResolucion", () => {
  it("desde «métricas cargadas»: restaurar, verificar o cancelar", () => {
    const opciones = opcionesResolucion(contexto())
    expect(
      opciones.map(({ efecto, estadoResultante }) => [efecto, estadoResultante])
    ).toEqual([
      ["restaurar", "METRICAS_CARGADAS"],
      ["verificar", "VERIFICADA"],
      ["cancelar", "CANCELADA"],
    ])
    expect(opciones.every((opcion) => opcion.bloqueo === null)).toBe(true)
    expect(opciones[0].titulo).toBe("Restaurar «métricas cargadas»")
    expect(opciones[2].requiereCausa).toBe(true)
  })

  it("desde una vencida: mantener el vencimiento, reabrir con el plazo o cancelar", () => {
    const opciones = opcionesResolucion(
      contexto({ estadoPrevio: "VENCIDA_SIN_PUBLICAR", plazoRecargaHoras: 36 })
    )
    expect(opciones.map((opcion) => opcion.efecto)).toEqual([
      "restaurar",
      "reabrir",
      "cancelar",
    ])
    expect(opciones[0].titulo).toBe("Mantener el vencimiento")
    expect(opciones[1]).toMatchObject({
      titulo: "Reabrir la publicación",
      estadoResultante: "CONTENIDO_ENTREGADO",
      bloqueo: null,
    })
    expect(opciones[1].explicacion).toContain(
      "tiene 36 horas para cargar la evidencia"
    )
  })

  it("no reabre si la oferta ya cerró (hint `oferta_cerrada`)", () => {
    const reabrir = opcionesResolucion(
      contexto({ estadoPrevio: "VENCIDA_SIN_PUBLICAR", ofertaCerrada: true })
    ).find((opcion) => opcion.efecto === "reabrir")
    expect(reabrir?.bloqueo).toBe(BLOQUEO_OFERTA_CERRADA)
  })

  it("verificar explica lo que falta: permiso, métricas o permanencia", () => {
    const verificar = (cambios: Partial<ContextoResolucion>) =>
      opcionesResolucion(contexto(cambios)).find(
        (opcion) => opcion.efecto === "verificar"
      )
    expect(verificar({ puedeVerificar: false })?.bloqueo).toBe(
      "Verificar exige además el permiso de validar métricas."
    )
    expect(
      verificar({
        verificacion: { ...SIN_BLOQUEOS, faltanMetricas: true },
      })?.bloqueo
    ).toBe(BLOQUEO_METRICAS)
    expect(
      verificar({
        verificacion: { ...SIN_BLOQUEOS, metricasPendientes: true },
      })?.bloqueo
    ).toBe(BLOQUEO_PENDIENTES)
    // En disputa no salen en la cola ni se rechazan: se aprueban desde la
    // ficha de la asignación (R5).
    for (const bloqueo of [BLOQUEO_METRICAS, BLOQUEO_PENDIENTES]) {
      expect(bloqueo).toMatch(/desde la ficha de la asignación/)
      expect(bloqueo).not.toMatch(/cola de validación|apruébalas o recházalas/)
    }
    expect(
      verificar({
        verificacion: {
          ...SIN_BLOQUEOS,
          permanenciaHasta: "2026-10-28T15:00:00Z",
        },
      })?.bloqueo
    ).toMatch(/^Permanencia pendiente hasta el 28 de oct/)
  })

  it("con `metricas.editar_validadas`, la permanencia pendiente pide constancia en vez de bloquear", () => {
    const verificar = opcionesResolucion(
      contexto({
        puedeConstanciaManual: true,
        verificacion: {
          ...SIN_BLOQUEOS,
          permanenciaHasta: "2026-10-28T15:00:00Z",
        },
      })
    ).find((opcion) => opcion.efecto === "verificar")
    expect(verificar).toMatchObject({ bloqueo: null, pideConstancia: true })
  })

  it("restaurar una verificada exige lo mismo que verificar", () => {
    const [restaurar] = opcionesResolucion(
      contexto({
        estadoPrevio: "VERIFICADA",
        puedeVerificar: false,
        verificacion: { ...SIN_BLOQUEOS, metricasPendientes: true },
      })
    )
    expect(restaurar.titulo).toBe("Restaurar «verificada»")
    expect(restaurar.bloqueo).toMatch(/^Hay métricas pendientes/)
  })

  it("sin estado previo no ofrece nada", () => {
    expect(opcionesResolucion(contexto({ estadoPrevio: null }))).toEqual([])
  })
})
