import { describe, expect, it } from "vitest"

import {
  claseDeCambio,
  construirHistorial,
  nombreActor,
  type Observador,
} from "./historial"
import type { FechasOferta, FilaHistorial } from "./tipos"

const YO = "0192f3a4-5b6c-7d8e-9f01-00000000000a"
const COMPANERO = "0192f3a4-5b6c-7d8e-9f01-00000000000b"
const MODERADOR = "0192f3a4-5b6c-7d8e-9f01-00000000000c"

const ANUNCIANTE: Observador = { perspectiva: "anunciante", usuarioId: YO }
const INTERNO: Observador = { perspectiva: "interno", usuarioId: MODERADOR }

/** Inicio de la ventana de publicación de la oferta de prueba. */
const VENTANA_INICIO = "2026-11-01T05:00:00.000Z"

const FECHAS: FechasOferta = {
  creadaAt: "2026-10-20T15:00:00.000Z",
  enviadaAt: null,
  devueltaAt: null,
  publicadaAt: null,
  cuposCompletosAt: null,
  enEjecucionAt: null,
  vencidaAt: null,
  cerradaAt: null,
  canceladaAt: null,
}

function fila(cambios: Partial<FilaHistorial>): FilaHistorial {
  return {
    id: "fila",
    desde: "BORRADOR",
    hacia: "EN_REVISION",
    actorTipo: "ANUNCIANTE",
    actorId: YO,
    actorNombre: "Ana",
    comentario: null,
    at: "2026-10-21T15:00:00.000Z",
    ...cambios,
  }
}

describe("claseDeCambio", () => {
  it.each([
    ["BORRADOR", "EN_REVISION", "ANUNCIANTE", "enviada"],
    ["DEVUELTA", "EN_REVISION", "ANUNCIANTE", "reenviada"],
    ["EN_REVISION", "BORRADOR", "ANUNCIANTE", "retirada"],
    ["EN_REVISION", "DEVUELTA", "ADMIN", "devuelta"],
    ["EN_REVISION", "DEVUELTA", "SISTEMA", "devuelta_sistema"],
    ["EN_REVISION", "PUBLICADA", "ADMIN", "publicada"],
    ["EN_REVISION", "CANCELADA", "ADMIN", "rechazada"],
    ["EN_REVISION", "CANCELADA", "SISTEMA", "cancelada"],
    ["PUBLICADA", "CANCELADA", "ANUNCIANTE", "cancelada"],
    ["PUBLICADA", "CUPOS_COMPLETOS", "SISTEMA", "cupos_completos"],
    ["CUPOS_COMPLETOS", "PUBLICADA", "SISTEMA", "cupo_liberado"],
    ["PUBLICADA", "EN_EJECUCION", "SISTEMA", "en_ejecucion"],
    ["PUBLICADA", "VENCIDA", "SISTEMA", "vencida"],
    ["EN_EJECUCION", "CERRADA", "SISTEMA", "cerrada"],
  ] as const)("%s → %s (%s) es «%s»", (desde, hacia, actorTipo, clase) => {
    expect(claseDeCambio({ desde, hacia, actorTipo })).toBe(clase)
  })
})

describe("nombreActor", () => {
  it("los cambios propios se leen como «Tú»", () => {
    expect(
      nombreActor({ tipo: "ANUNCIANTE", id: YO, nombre: "Ana" }, ANUNCIANTE)
    ).toBe("Tú")
  })

  it("el anunciante no ve quién del equipo AMO moderó", () => {
    expect(
      nombreActor(
        { tipo: "ADMIN", id: MODERADOR, nombre: "Carlos" },
        ANUNCIANTE
      )
    ).toBe("Equipo AMO")
    expect(
      nombreActor({ tipo: "ADMIN", id: COMPANERO, nombre: "Carlos" }, INTERNO)
    ).toBe("Carlos")
    expect(
      nombreActor({ tipo: "ADMIN", id: COMPANERO, nombre: null }, INTERNO)
    ).toBe("Equipo AMO")
  })

  it("compañeros de empresa y anunciante visto desde AMO", () => {
    expect(
      nombreActor(
        { tipo: "ANUNCIANTE", id: COMPANERO, nombre: null },
        ANUNCIANTE
      )
    ).toBe("Tu equipo")
    expect(
      nombreActor({ tipo: "ANUNCIANTE", id: COMPANERO, nombre: null }, INTERNO)
    ).toBe("El anunciante")
    expect(
      nombreActor({ tipo: "ANUNCIANTE", id: COMPANERO, nombre: "Luz" }, INTERNO)
    ).toBe("Luz")
  })

  it("el sistema es «Automático»", () => {
    expect(
      nombreActor({ tipo: "SISTEMA", id: null, nombre: null }, INTERNO)
    ).toBe("Automático")
  })
})

describe("construirHistorial", () => {
  it("empieza con la creación y conserva el comentario de cada devolución", () => {
    const { eventos, reconstruido } = construirHistorial(
      {
        filas: [
          fila({ id: "a", at: "2026-10-21T10:00:00.000Z" }),
          fila({
            id: "b",
            desde: "EN_REVISION",
            hacia: "DEVUELTA",
            actorTipo: "ADMIN",
            actorId: MODERADOR,
            actorNombre: null,
            comentario: "  Cambia el enlace.  ",
            at: "2026-10-21T12:00:00.000Z",
          }),
          fila({
            id: "c",
            desde: "DEVUELTA",
            hacia: "EN_REVISION",
            at: "2026-10-21T14:00:00.000Z",
          }),
        ],
        fechas: FECHAS,
        comentarioModeracion: "Cambia el enlace.",
        ventanaInicio: VENTANA_INICIO,
      },
      ANUNCIANTE
    )
    expect(reconstruido).toBe(false)
    expect(eventos.map((evento) => [evento.titulo, evento.actor])).toEqual([
      ["Creada como borrador", null],
      ["Enviada a revisión", "Tú"],
      ["Devuelta con comentarios", "Equipo AMO"],
      ["Reenviada a revisión", "Tú"],
    ])
    expect(eventos[2]).toMatchObject({
      clase: "devuelta",
      tono: "aviso",
      comentario: "Cambia el enlace.",
    })
    expect(eventos[1].tono).toBe("aviso")
  })

  it("ordena por fecha aunque las filas lleguen desordenadas", () => {
    const { eventos } = construirHistorial(
      {
        filas: [
          fila({
            id: "tarde",
            desde: "EN_REVISION",
            hacia: "PUBLICADA",
            actorTipo: "ADMIN",
            at: "2026-10-22T10:00:00.000Z",
          }),
          fila({ id: "temprano", at: "2026-10-21T10:00:00.000Z" }),
        ],
        fechas: FECHAS,
        comentarioModeracion: null,
        ventanaInicio: VENTANA_INICIO,
      },
      INTERNO
    )
    expect(eventos.map((evento) => evento.id)).toEqual([
      "creada",
      "temprano",
      "tarde",
    ])
  })

  it("sin filas, reconstruye con las fechas de la oferta", () => {
    const resultado = construirHistorial(
      {
        filas: [],
        fechas: {
          ...FECHAS,
          enviadaAt: "2026-10-21T10:00:00.000Z",
          devueltaAt: "2026-10-21T12:00:00.000Z",
          publicadaAt: "2026-10-22T10:00:00.000Z",
        },
        comentarioModeracion: "Ajusta el copy.",
        ventanaInicio: VENTANA_INICIO,
      },
      INTERNO
    )
    expect(resultado.reconstruido).toBe(true)
    expect(resultado.eventos.map((evento) => evento.clase)).toEqual([
      "creada",
      "enviada",
      "devuelta",
      "publicada",
    ])
    expect(resultado.eventos[2].comentario).toBe("Ajusta el copy.")
    expect(resultado.eventos.every((evento) => evento.actor === null)).toBe(
      true
    )
  })

  it("pasar a ejecución se titula según si ya empezó la ventana", () => {
    const { eventos } = construirHistorial(
      {
        filas: [
          // La fecha límite llegó antes que la ventana, con medios asignados.
          fila({
            id: "aceptacion",
            desde: "PUBLICADA",
            hacia: "EN_EJECUCION",
            actorTipo: "SISTEMA",
            at: "2026-10-30T22:05:00.000Z",
          }),
        ],
        fechas: FECHAS,
        comentarioModeracion: null,
        ventanaInicio: VENTANA_INICIO,
      },
      INTERNO
    )
    expect(eventos[1]).toMatchObject({
      clase: "en_ejecucion",
      titulo: "Se cerró la aceptación con medios asignados",
    })

    const reconstruido = construirHistorial(
      {
        filas: [],
        fechas: {
          ...FECHAS,
          cuposCompletosAt: "2026-10-28T10:00:00.000Z",
          enEjecucionAt: "2026-11-01T05:01:00.000Z",
        },
        comentarioModeracion: null,
        ventanaInicio: VENTANA_INICIO,
      },
      ANUNCIANTE
    )
    expect(reconstruido.eventos.at(-1)).toMatchObject({
      clase: "en_ejecucion",
      titulo: "Empezó la ventana de publicación",
    })
  })

  it("vencer solo ocurre sin cupos tomados y así se titula", () => {
    const { eventos } = construirHistorial(
      {
        filas: [
          fila({
            id: "vencida",
            desde: "PUBLICADA",
            hacia: "VENCIDA",
            actorTipo: "SISTEMA",
            at: "2026-10-30T22:05:00.000Z",
          }),
        ],
        fechas: FECHAS,
        comentarioModeracion: null,
        ventanaInicio: VENTANA_INICIO,
      },
      ANUNCIANTE
    )
    expect(eventos[1].titulo).toBe("Venció la fecha límite sin cupos tomados")
  })

  it("un borrador recién creado solo tiene la creación", () => {
    expect(
      construirHistorial(
        {
          filas: [],
          fechas: FECHAS,
          comentarioModeracion: null,
          ventanaInicio: VENTANA_INICIO,
        },
        ANUNCIANTE
      )
    ).toEqual({
      reconstruido: false,
      eventos: [
        {
          id: "creada",
          clase: "creada",
          titulo: "Creada como borrador",
          tono: "neutro",
          at: FECHAS.creadaAt,
          actor: null,
          comentario: null,
        },
      ],
    })
  })
})
