// @vitest-environment node
/**
 * Decisiones de moderación con el DAL, la transición y el cliente de sesión
 * simulados: autorizan antes que nada, mandan el `enviada_at` que mostraba la
 * ficha tal cual y, si el anunciante reenvió la oferta mientras se revisaba
 * (hint `oferta_reenviada`), refrescan la ficha y lo explican.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJE_OFERTA_REENVIADA } from "./decision"

const OFERTA = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"
/** Como lo entrega PostgREST: los microsegundos deben llegar intactos a la BD. */
const ENVIADA = "2026-10-21T15:04:05.123456+00:00"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  transiciones: [] as unknown[],
  error: null as unknown,
  estadoActual: "EN_REVISION",
  refrescos: 0,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  refresh: vi.fn(() => {
    estado.refrescos += 1
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1" }
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => {
    estado.orden.push("contexto")
    return { actorId: "u1", sessionId: "s1" }
  }),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(async (_contexto: unknown, solicitud: unknown) => {
    estado.transiciones.push(solicitud)
    return { data: null, error: estado.error }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { estado: estado.estadoActual },
            error: null,
          }),
        }),
      }),
    }),
  })),
}))

const {
  cancelarOfertaPublicada,
  devolverOferta,
  publicarOferta,
  rechazarOferta,
} = await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.transiciones = []
  estado.error = null
  estado.estadoActual = "EN_REVISION"
  estado.refrescos = 0
})

describe("decisiones sobre una oferta en revisión", () => {
  it("publicar manda el envío que mostró la ficha, después del DAL", async () => {
    const resultado = await publicarOferta({
      ofertaId: OFERTA,
      enviadaAt: ENVIADA,
    })
    expect(estado.orden).toEqual(["dal:ofertas.moderar", "contexto"])
    expect(estado.transiciones).toEqual([
      {
        entidad: "ofertas",
        id: OFERTA,
        hacia: "PUBLICADA",
        datos: { enviada_at: ENVIADA },
      },
    ])
    expect(estado.refrescos).toBe(1)
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("devolver y rechazar también deciden sobre ese envío", async () => {
    await devolverOferta({
      ofertaId: OFERTA,
      enviadaAt: ENVIADA,
      motivo: "El enlace no abre.",
    })
    await rechazarOferta({
      ofertaId: OFERTA,
      enviadaAt: null,
      motivo: "Promociona apuestas no autorizadas.",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "ofertas",
        id: OFERTA,
        hacia: "DEVUELTA",
        motivo: "El enlace no abre.",
        datos: { enviada_at: ENVIADA },
      },
      {
        entidad: "ofertas",
        id: OFERTA,
        hacia: "CANCELADA",
        motivo: "Promociona apuestas no autorizadas.",
        datos: {
          comentario_moderacion: "Promociona apuestas no autorizadas.",
          enviada_at: null,
        },
      },
    ])
  })

  it("si el anunciante la reenvió mientras se revisaba, refresca la ficha y lo explica", async () => {
    estado.error = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details:
        "El anunciante cambió la oferta mientras la revisabas: vuelve a abrirla para revisar lo que envió ahora.",
      hint: "oferta_reenviada",
    }
    const resultado = await publicarOferta({
      ofertaId: OFERTA,
      enviadaAt: ENVIADA,
    })
    expect(resultado).toEqual({ ok: false, error: MENSAJE_OFERTA_REENVIADA })
    expect(estado.refrescos).toBe(1)
  })

  it("otro rechazo de la BD no refresca: el diálogo muestra el detalle", async () => {
    estado.error = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "La fecha límite de aceptación ya pasó.",
    }
    expect(
      await publicarOferta({ ofertaId: OFERTA, enviadaAt: ENVIADA })
    ).toEqual({ ok: false, error: "La fecha límite de aceptación ya pasó." })
    expect(estado.refrescos).toBe(0)
  })

  it("sin el envío revisado no toca la BD", async () => {
    // @ts-expect-error: falta `enviadaAt` a propósito (una llamada vieja o manipulada).
    expect((await publicarOferta({ ofertaId: OFERTA })).ok).toBe(false)
    expect(estado.transiciones).toEqual([])
  })
})

describe("cancelar una oferta publicada", () => {
  it("no depende del envío y comprueba que siga publicada", async () => {
    estado.estadoActual = "PUBLICADA"
    await cancelarOfertaPublicada({
      ofertaId: OFERTA,
      motivo: "Lo solicitó el anunciante.",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "ofertas",
        id: OFERTA,
        hacia: "CANCELADA",
        motivo: "Lo solicitó el anunciante.",
      },
    ])
  })
})
