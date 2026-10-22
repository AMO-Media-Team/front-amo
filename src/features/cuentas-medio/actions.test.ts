// @vitest-environment node
/**
 * `quitarCuenta` con el DAL y Supabase simulados: autoriza y valida antes de
 * tocar la BD, delega todas las reglas en `quitar_cuenta_social_srv` (actor y
 * sesión del contexto, nunca el medio que mande el cliente) y muestra el
 * `detail` con que la BD explica por qué no se puede.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJE_INESPERADO } from "@/lib/errores-bd"

const MEDIO = "0192f1c2-5b6a-7d00-8000-000000000001"
const CUENTA = "0192f1c2-5b6a-7d00-8000-0000000000c1"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: { id: "u1", medioId: null as string | null },
  rpc: { error: null as unknown },
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  crearClienteServidor: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return estado.usuario
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async (actor: { id: string }) => {
    estado.orden.push("contexto")
    return {
      actorId: actor.id,
      sessionId: "s1",
      admin: { rpc: simulados.rpc, from: simulados.from },
    }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: simulados.crearClienteServidor,
}))
vi.mock("@/lib/storage/subidas", () => ({
  prepararSubidaFirmada: vi.fn(),
  confirmarObjeto: vi.fn(),
}))
vi.mock("@/lib/storage/descargas", () => ({
  MENSAJES_DESCARGA: { noEncontrado: "no-encontrado" },
  firmarDescarga: vi.fn(),
}))
vi.mock("./queries", () => ({ parametrosVerificacion: vi.fn() }))

const { quitarCuenta } = await import("./actions")
const { MENSAJES_CUENTAS } = await import("./errores")

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.usuario = { id: "u1", medioId: MEDIO }
  estado.rpc = { error: null }
  simulados.rpc.mockImplementation(async () => {
    estado.orden.push("rpc")
    return estado.rpc
  })
})

describe("quitarCuenta", () => {
  it("autoriza, valida y llama a la RPC con el actor y la sesión del contexto", async () => {
    const resultado = await quitarCuenta({ cuentaId: CUENTA })
    expect(resultado).toEqual({ ok: true, datos: undefined })
    expect(estado.orden).toEqual([
      "dal:medios.editar_propio",
      "contexto",
      "rpc",
    ])
    expect(simulados.rpc).toHaveBeenCalledWith("quitar_cuenta_social_srv", {
      p_cuenta_id: CUENTA,
      p_actor_id: "u1",
      p_session_id: "s1",
    })
    expect(simulados.refresh).toHaveBeenCalledOnce()
  })

  it("no lee ni escribe tablas: las reglas viven en la RPC", async () => {
    await quitarCuenta({ cuentaId: CUENTA })
    expect(simulados.crearClienteServidor).not.toHaveBeenCalled()
    expect(simulados.from).not.toHaveBeenCalled()
  })

  it("sin medio en la sesión no llega a la BD", async () => {
    estado.usuario = { id: "u1", medioId: null }
    const resultado = await quitarCuenta({ cuentaId: CUENTA })
    expect(resultado).toEqual({ ok: false, error: MENSAJES_CUENTAS.sinMedio })
    expect(estado.orden).toEqual(["dal:medios.editar_propio"])
  })

  it("un identificador inválido se rechaza antes de la BD", async () => {
    const resultado = await quitarCuenta({ cuentaId: "no-es-un-id" })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:medios.editar_propio"])
    expect(simulados.rpc).not.toHaveBeenCalled()
  })

  it.each([
    [
      "AMO_TRANSICION_INVALIDA",
      "Una cuenta verificada no se puede quitar desde aquí porque puede tener campañas asociadas. Pídeselo al equipo de AMO.",
    ],
    [
      "AMO_TRANSICION_INVALIDA",
      "Espera a que terminemos de revisar la verificación de esta cuenta para quitarla.",
    ],
    ["AMO_NO_AUTORIZADO", "La cuenta no existe o no es de tu medio."],
  ])(
    "%s muestra el detalle de la BD y repinta la página",
    async (codigo, detalle) => {
      estado.rpc = {
        error: { code: "P0001", message: codigo, details: detalle },
      }
      const resultado = await quitarCuenta({ cuentaId: CUENTA })
      expect(resultado).toEqual({ ok: false, error: detalle })
      expect(simulados.refresh).toHaveBeenCalledOnce()
    }
  )

  it("un error inesperado no expone el mensaje técnico", async () => {
    estado.rpc = {
      error: { code: "XX000", message: "internal error", details: null },
    }
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    const resultado = await quitarCuenta({ cuentaId: CUENTA })
    expect(resultado).toEqual({ ok: false, error: MENSAJE_INESPERADO })
    expect(silencio).toHaveBeenCalledOnce()
    silencio.mockRestore()
  })
})
