// @vitest-environment node
/**
 * Gestión de una asignación por el equipo AMO (ADM-010, ADM-011) con el DAL,
 * el cliente de sesión y la RPC simulados: autorizan antes que nada, validan
 * con el mismo esquema que el diálogo, no cancelan si la asignación cambió de
 * estado mientras se revisaba y traducen los `hint` de la BD.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  BLOQUEO_CANCELAR_EN_DISPUTA,
  BLOQUEO_CANCELAR_LIQUIDADA,
} from "./gestion-asignacion"

const ASIGNACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const DISPUTA = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: [] as string[],
  rpc: [] as { nombre: string; argumentos: unknown }[],
  respuesta: { data: null as unknown, error: null as unknown },
  estadoActual: "PUBLICADA" as string | null,
  refrescos: 0,
}))

vi.mock("server-only", () => ({}))
// Lo que no usa la gestión y cargaría el entorno (clientes de Supabase).
vi.mock("./queries/comun", () => ({ configuracionOperacion: vi.fn() }))
vi.mock("@/lib/auth/registro", () => ({ registrarEvento: vi.fn() }))
vi.mock("next/cache", () => ({
  refresh: vi.fn(() => {
    estado.refrescos += 1
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", permisos: estado.permisos }
  }),
  tieneAlgunPermiso: vi.fn(
    (usuario: { permisos: string[] }, permisos: string[]) =>
      permisos.some((permiso) => usuario.permisos.includes(permiso))
  ),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => {
    estado.orden.push("contexto")
    return {
      actorId: "u1",
      sessionId: "s1",
      admin: {
        rpc: async (nombre: string, argumentos: unknown) => {
          estado.rpc.push({ nombre, argumentos })
          return estado.respuesta
        },
      },
    }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            estado.orden.push("lectura")
            return {
              data: estado.estadoActual
                ? { estado: estado.estadoActual }
                : null,
              error: null,
            }
          },
        }),
      }),
    }),
  })),
}))

const { abrirDisputaAsignacion, cancelarAsignacion } = await import("./actions")

const GESTION = [
  "asignaciones.ver",
  "asignaciones.gestionar",
  "medios.suspender",
  "disputas.abrir",
]

const CANCELACION = {
  asignacionId: ASIGNACION,
  estadoVisto: "PUBLICADA",
  causa: "FRAUDE",
  motivo: "Las métricas no coinciden con la captura del panel.",
  suspenderMedio: true,
} as const

beforeEach(() => {
  estado.orden = []
  estado.permisos = [...GESTION]
  estado.rpc = []
  estado.respuesta = { data: null, error: null }
  estado.estadoActual = "PUBLICADA"
  estado.refrescos = 0
})

describe("cancelarAsignacion", () => {
  it("autoriza, comprueba el estado y cancela con causa y suspensión", async () => {
    estado.respuesta = {
      data: {
        asignacion_id: ASIGNACION,
        estado: "CANCELADA",
        medio_suspendido: true,
      },
      error: null,
    }
    const resultado = await cancelarAsignacion(CANCELACION)
    expect(resultado).toEqual({ ok: true, datos: { medioSuspendido: true } })
    expect(estado.orden).toEqual([
      "dal:asignaciones.gestionar",
      "lectura",
      "contexto",
    ])
    expect(estado.rpc).toEqual([
      {
        nombre: "cancelar_asignacion_srv",
        argumentos: {
          p_asignacion_id: ASIGNACION,
          p_causa: "FRAUDE",
          p_motivo: CANCELACION.motivo,
          p_suspender_medio: true,
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(estado.refrescos).toBe(1)
  })

  it("una entrada inválida no llega a la BD", async () => {
    const resultado = await cancelarAsignacion({
      ...CANCELACION,
      causa: "ADMINISTRATIVA",
    })
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.erroresCampo?.suspenderMedio).toEqual([
      "La suspensión solo acompaña una cancelación por fraude o por incumplimiento del medio.",
    ])
    expect(estado.orden).toEqual(["dal:asignaciones.gestionar"])
    expect(estado.rpc).toHaveLength(0)
  })

  it("sin `medios.suspender` no suspende (y lo dice en la casilla)", async () => {
    estado.permisos = GESTION.filter((p) => p !== "medios.suspender")
    const resultado = await cancelarAsignacion(CANCELACION)
    expect(resultado.ok).toBe(false)
    expect(
      !resultado.ok && resultado.erroresCampo?.suspenderMedio?.[0]
    ).toMatch(/No tienes permiso para suspender medios/)
    expect(estado.rpc).toHaveLength(0)
  })

  it("si cambió de estado mientras se revisaba, refresca y no cancela", async () => {
    estado.estadoActual = "VERIFICADA"
    const resultado = await cancelarAsignacion(CANCELACION)
    expect(resultado).toEqual({
      ok: false,
      error:
        "La asignación cambió mientras la revisabas: ahora está «verificada». La ficha ya muestra su estado actual; revísala antes de cancelar.",
    })
    expect(estado.rpc).toHaveLength(0)
    expect(estado.refrescos).toBe(1)
  })

  it("una asignación ajena o inexistente no se cancela", async () => {
    estado.estadoActual = null
    const resultado = await cancelarAsignacion(CANCELACION)
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.error).toMatch(/No encontramos/)
    expect(estado.rpc).toHaveLength(0)
  })

  it.each([
    ["liquidacion_vigente", BLOQUEO_CANCELAR_LIQUIDADA],
    ["en_disputa", BLOQUEO_CANCELAR_EN_DISPUTA],
  ])("el hint %s tiene texto propio", async (hint, mensaje) => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "detalle técnico",
        hint,
      },
    }
    const resultado = await cancelarAsignacion(CANCELACION)
    expect(resultado).toEqual({ ok: false, error: mensaje })
    expect(estado.refrescos).toBe(0)
  })

  it("los demás errores de negocio usan el detalle de la BD", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_MOTIVO_REQUERIDO",
        details: "Indica una causa de cancelación válida.",
      },
    }
    expect(await cancelarAsignacion(CANCELACION)).toEqual({
      ok: false,
      error: "Indica una causa de cancelación válida.",
    })
  })
})

describe("abrirDisputaAsignacion", () => {
  const DISPUTA_NUEVA = {
    asignacionId: ASIGNACION,
    motivo: "METRICAS",
    descripcion: "El alcance del corte de 72 h no coincide con la captura.",
  } as const

  it("autoriza y abre la disputa como equipo AMO", async () => {
    estado.respuesta = { data: DISPUTA, error: null }
    const resultado = await abrirDisputaAsignacion(DISPUTA_NUEVA)
    expect(resultado).toEqual({ ok: true, datos: { disputaId: DISPUTA } })
    expect(estado.orden).toEqual(["dal:disputas.abrir", "contexto"])
    expect(estado.rpc).toEqual([
      {
        nombre: "abrir_disputa_srv",
        argumentos: {
          p_asignacion_id: ASIGNACION,
          p_motivo: "METRICAS",
          p_descripcion: DISPUTA_NUEVA.descripcion,
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(estado.refrescos).toBe(1)
  })

  it("es la acción del equipo: sin `asignaciones.ver` no sigue", async () => {
    estado.permisos = ["disputas.abrir"]
    const resultado = await abrirDisputaAsignacion(DISPUTA_NUEVA)
    expect(resultado.ok).toBe(false)
    expect(estado.rpc).toHaveLength(0)
  })

  it("valida la descripción con el mismo esquema que el diálogo", async () => {
    const resultado = await abrirDisputaAsignacion({
      ...DISPUTA_NUEVA,
      descripcion: "corta",
    })
    expect(!resultado.ok && resultado.erroresCampo?.descripcion?.[0]).toMatch(
      /al menos 10/
    )
    expect(estado.rpc).toHaveLength(0)
  })

  it("otra disputa abierta se explica con la restricción", async () => {
    estado.respuesta = {
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "disputas_abierta_key"',
      },
    }
    expect(await abrirDisputaAsignacion(DISPUTA_NUEVA)).toEqual({
      ok: false,
      error: "Ya hay una disputa abierta para esta asignación.",
    })
  })
})
