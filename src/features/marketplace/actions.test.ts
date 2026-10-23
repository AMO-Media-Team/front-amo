// @vitest-environment node
/**
 * Acciones del marketplace con el DAL y los clientes de Supabase simulados:
 * autorizan antes que nada, validan con el mismo esquema que el cliente y van
 * por los procedimientos `*_srv` con el actor, su sesión, su medio y la clave
 * de idempotencia tal cual llegó (MED-010).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const OFERTA = "01a16693-72fe-713c-a45a-70d759c08120"
const CUENTA = "01a16693-9006-7dcb-9c94-afaf8092c0d9"
const CLAVE = "7d1f9a52-3c4b-4e8f-9a21-6b0c5d8e7f10"
const MEDIO = "e2e00000-0000-4000-8000-00000000b001"

interface Respuesta {
  data: unknown
  error: unknown
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  rpc: [] as { cliente: string; nombre: string; args: unknown }[],
  respuesta: { data: null, error: null } as Respuesta,
  medioId: "e2e00000-0000-4000-8000-00000000b001" as string | null,
  lanzar: false,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", medioId: estado.medioId }
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async (actor: { id: string }) => {
    estado.orden.push("contexto")
    if (estado.lanzar) throw new Error("red")
    return {
      actorId: actor.id,
      sessionId: "s1",
      admin: {
        rpc: async (nombre: string, args: unknown) => {
          estado.rpc.push({ cliente: "admin", nombre, args })
          return estado.respuesta
        },
      },
    }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    rpc: async (nombre: string, args: unknown) => {
      estado.rpc.push({ cliente: "sesion", nombre, args })
      return estado.respuesta
    },
  })),
}))

const { aceptarOferta, rechazarOferta, registrarVistaOferta } =
  await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.rpc = []
  estado.respuesta = { data: null, error: null }
  estado.medioId = MEDIO
  estado.lanzar = false
  vi.spyOn(console, "error").mockImplementation(() => {})
})

const ENTRADA = {
  ofertaId: OFERTA,
  cuentaSocialId: CUENTA,
  claveIdempotencia: CLAVE,
}

describe("aceptarOferta", () => {
  it("reserva con el actor, su sesión, su medio y la clave del intento", async () => {
    estado.respuesta = {
      data: [{ asignacion_id: "asig-1", monto_medio: 176_000 }],
      error: null,
    }
    const resultado = await aceptarOferta(ENTRADA)
    expect(estado.orden).toEqual(["dal:ofertas.aceptar", "contexto"])
    expect(estado.rpc).toEqual([
      {
        cliente: "admin",
        nombre: "reservar_cupo_srv",
        args: {
          p_oferta_id: OFERTA,
          p_medio_id: MEDIO,
          p_cuenta_social_id: CUENTA,
          p_actor_id: "u1",
          p_session_id: "s1",
          p_clave_idempotencia: CLAVE,
        },
      },
    ])
    expect(resultado).toEqual({
      ok: true,
      datos: { asignacionId: "asig-1", montoMedio: 176_000 },
    })
  })

  it("devuelve el pago congelado tal como llegó (numeric en texto) o null", async () => {
    estado.respuesta = {
      data: [{ asignacion_id: "asig-1", monto_medio: "100000.00" }],
      error: null,
    }
    expect(await aceptarOferta(ENTRADA)).toEqual({
      ok: true,
      datos: { asignacionId: "asig-1", montoMedio: 100_000 },
    })
    estado.respuesta = {
      data: [{ asignacion_id: "asig-1", monto_medio: null }],
      error: null,
    }
    expect(await aceptarOferta(ENTRADA)).toEqual({
      ok: true,
      datos: { asignacionId: "asig-1", montoMedio: null },
    })
  })

  it("el último cupo tomado por otro: «No quedan cupos en tu franja»", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_SIN_CUPO",
        details: "No quedan cupos en tu franja.",
      },
    }
    expect(await aceptarOferta(ENTRADA)).toMatchObject({
      ok: false,
      titulo: "No quedan cupos en tu franja",
      definitivo: true,
      bloquea: true,
    })
  })

  it("un fallo de red o del servidor permite reintentar con la misma clave", async () => {
    estado.lanzar = true
    expect(await aceptarOferta(ENTRADA)).toMatchObject({
      ok: false,
      codigo: null,
      definitivo: false,
    })
    estado.lanzar = false
    estado.respuesta = { data: [], error: null }
    expect(await aceptarOferta(ENTRADA)).toMatchObject({ definitivo: false })
  })

  it("valida antes de tocar la BD (sin cuenta elegida)", async () => {
    const resultado = await aceptarOferta({ ...ENTRADA, cuentaSocialId: "" })
    expect(resultado).toMatchObject({
      ok: false,
      error: "Elige con qué cuenta vas a publicar.",
      definitivo: true,
    })
    expect(estado.rpc).toEqual([])
  })

  it("una cuenta sin medio no llega a la reserva", async () => {
    estado.medioId = null
    expect(await aceptarOferta(ENTRADA)).toMatchObject({
      ok: false,
      codigo: "AMO_NO_ELEGIBLE",
      error: "Tu cuenta aún no está vinculada a un medio.",
    })
    expect(estado.rpc).toEqual([])
  })
})

describe("rechazarOferta («No me interesa»)", () => {
  it("motivo opcional: vacío viaja como null", async () => {
    estado.respuesta = { data: "asig-r", error: null }
    expect(await rechazarOferta({ ofertaId: OFERTA, motivo: "  " })).toEqual({
      ok: true,
      datos: undefined,
    })
    expect(estado.orden).toEqual(["dal:ofertas.aceptar", "contexto"])
    expect(estado.rpc).toEqual([
      {
        cliente: "admin",
        nombre: "rechazar_oferta_srv",
        args: {
          p_oferta_id: OFERTA,
          p_actor_id: "u1",
          p_session_id: "s1",
          p_motivo: null,
        },
      },
    ])
  })

  it("lleva el motivo recortado y traduce los errores", async () => {
    estado.respuesta = {
      data: null,
      error: { code: "P0001", message: "AMO_OFERTA_NO_DISPONIBLE" },
    }
    const resultado = await rechazarOferta({
      ofertaId: OFERTA,
      motivo: " No encaja ",
    })
    expect(estado.rpc[0]?.args).toMatchObject({ p_motivo: "No encaja" })
    expect(resultado).toEqual({
      ok: false,
      error: "Esta oferta ya no está disponible: ya no aparece en tu lista.",
    })
  })
})

describe("registrarVistaOferta", () => {
  it("registra con la sesión del medio, después del DAL", async () => {
    expect(await registrarVistaOferta({ ofertaId: OFERTA })).toEqual({
      ok: true,
      datos: undefined,
    })
    expect(estado.orden).toEqual(["dal:ofertas.marketplace"])
    expect(estado.rpc).toEqual([
      {
        cliente: "sesion",
        nombre: "registrar_vista_oferta",
        args: { p_oferta_id: OFERTA },
      },
    ])
  })

  it("un id inválido no llega a la BD", async () => {
    expect((await registrarVistaOferta({ ofertaId: "x" })).ok).toBe(false)
    expect(estado.rpc).toEqual([])
  })
})
