// @vitest-environment node
/**
 * `archivarOferta` con el DAL y el cliente de servicio simulados: autoriza
 * antes que nada, va por `archivar_oferta_srv` con el actor y su sesión y no
 * refresca la ficha (ya no existiría: el cliente vuelve a la campaña).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const OFERTA = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  rpc: [] as { nombre: string; args: Record<string, unknown> }[],
  error: null as unknown,
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
    return { id: "u1", anuncianteId: "e2e00000-0000-4000-8000-00000000a001" }
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async (actor: { id: string }) => {
    estado.orden.push("contexto")
    return {
      actorId: actor.id,
      sessionId: "s1",
      admin: {
        rpc: async (nombre: string, args: Record<string, unknown>) => {
          estado.rpc.push({ nombre, args })
          return { data: null, error: estado.error }
        },
      },
    }
  }),
}))
vi.mock("@/lib/negocio/transicionar", () => ({ transicionar: vi.fn() }))

const { archivarOferta } = await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.rpc = []
  estado.error = null
  estado.refrescos = 0
})

describe("archivarOferta", () => {
  it("archiva con el actor y su sesión, después del DAL y sin refrescar", async () => {
    const resultado = await archivarOferta({ ofertaId: OFERTA })
    expect(estado.orden).toEqual(["dal:ofertas.gestionar_propias", "contexto"])
    expect(estado.rpc).toEqual([
      {
        nombre: "archivar_oferta_srv",
        args: { p_oferta_id: OFERTA, p_actor_id: "u1", p_session_id: "s1" },
      },
    ])
    expect(estado.refrescos).toBe(0)
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("una oferta viva no se archiva: lo explica la BD", async () => {
    estado.error = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "Solo se archivan borradores y ofertas terminadas.",
    }
    expect(await archivarOferta({ ofertaId: OFERTA })).toEqual({
      ok: false,
      error: "Solo se archivan borradores y ofertas terminadas.",
    })
  })

  it("valida el id antes de tocar la BD", async () => {
    expect((await archivarOferta({ ofertaId: "x" })).ok).toBe(false)
    expect(estado.rpc).toEqual([])
  })
})
