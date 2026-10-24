// @vitest-environment node
/**
 * Server Actions de la suspensión de medios con el DAL, `transicionar` y las
 * lecturas simulados: autorizan primero, validan con el mismo esquema, cambian
 * el estado solo por la transición con actor y sesión, nunca cancelan
 * asignaciones y dicen cuántas siguen en curso.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AsignacionEnCurso } from "./tipos"

const MEDIO = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: [] as string[],
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  transicionar: vi.fn(),
  asignacionesEnCursoDelMedio: vi.fn(),
  admin: { soy: "admin" },
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "actor-1", permisos: estado.permisos }
  }),
  tieneAlgunPermiso: (
    usuario: { permisos: readonly string[] },
    permisos: readonly string[]
  ) => permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => ({
    actorId: "actor-1",
    sessionId: "sesion-1",
    admin: simulados.admin,
  })),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(async (...argumentos: unknown[]) => {
    estado.orden.push("transicionar")
    return simulados.transicionar(...argumentos)
  }),
}))
vi.mock("./queries", () => ({
  asignacionesEnCursoDelMedio: simulados.asignacionesEnCursoDelMedio,
}))

const { consultarAsignacionesEnCurso, reactivarMedio, suspenderMedio } =
  await import("./actions")
const { MENSAJES_SUSPENSION } = await import("./errores")

function enCurso(cambios: Partial<AsignacionEnCurso> = {}): AsignacionEnCurso {
  return {
    id: "0192f3a4-0000-7000-8000-000000000001",
    estado: "ACEPTADA",
    estadoPrevioDisputa: null,
    ofertaId: "0192f3a4-0000-7000-8000-0000000000bb",
    oferta: "Lanzamiento",
    anunciante: "Café del Sur",
    fechaLimitePublicacion: "2026-10-30T22:00:00Z",
    montoBruto: 480000,
    disputaAbiertaId: null,
    cancelable: true,
    ...cambios,
  }
}

beforeEach(() => {
  estado.orden = []
  estado.permisos = ["medios.suspender", "asignaciones.ver"]
  simulados.refresh.mockReset()
  simulados.transicionar.mockReset().mockResolvedValue({ error: null })
  simulados.asignacionesEnCursoDelMedio
    .mockReset()
    .mockResolvedValue([
      enCurso(),
      enCurso({ id: "otra", estado: "EN_DISPUTA", cancelable: false }),
    ])
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("suspenderMedio", () => {
  it("autoriza, transiciona con motivo y dice cuántas siguen en curso", async () => {
    const resultado = await suspenderMedio({
      medioId: MEDIO,
      motivo: "  Métricas que no cuadran  ",
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { enCurso: { total: 2, cancelables: 1, enDisputa: 1 } },
    })
    expect(estado.orden[0]).toBe("dal:medios.suspender")
    expect(simulados.transicionar).toHaveBeenCalledWith(
      { actorId: "actor-1", sessionId: "sesion-1", admin: simulados.admin },
      {
        entidad: "medios",
        id: MEDIO,
        hacia: "SUSPENDIDO",
        motivo: "Métricas que no cuadran",
      }
    )
    // Una sola transición: nunca cancela asignaciones por su cuenta.
    expect(simulados.transicionar).toHaveBeenCalledTimes(1)
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("sin motivo no llega a la BD y el error queda en el campo", async () => {
    const resultado = await suspenderMedio({ medioId: MEDIO, motivo: "  " })
    expect(resultado.ok).toBe(false)
    if (resultado.ok) return
    expect(resultado.erroresCampo?.motivo).toEqual([
      "Describe el motivo (al menos 5 caracteres).",
    ])
    expect(simulados.transicionar).not.toHaveBeenCalled()
    expect(estado.orden).toEqual(["dal:medios.suspender"])
  })

  it("si otra persona ya cambió el estado, lo explica y refresca la ficha", async () => {
    simulados.transicionar.mockResolvedValue({
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "El registro no puede pasar a ese estado desde el actual.",
      },
    })
    expect(
      await suspenderMedio({ medioId: MEDIO, motivo: "Fraude en métricas" })
    ).toEqual({ ok: false, error: MENSAJES_SUSPENSION.yaNoVerificado })
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
    expect(simulados.asignacionesEnCursoDelMedio).not.toHaveBeenCalled()
  })

  it("sin `asignaciones.ver` suspende igual y no cuenta lo que sigue en curso", async () => {
    estado.permisos = ["medios.suspender"]
    expect(
      await suspenderMedio({ medioId: MEDIO, motivo: "Fraude en métricas" })
    ).toEqual({ ok: true, datos: { enCurso: null } })
    expect(simulados.asignacionesEnCursoDelMedio).not.toHaveBeenCalled()
  })

  it("si no puede leer lo que sigue en curso, la suspensión ya quedó hecha", async () => {
    simulados.asignacionesEnCursoDelMedio.mockRejectedValue(new Error("57014"))
    expect(
      await suspenderMedio({ medioId: MEDIO, motivo: "Fraude en métricas" })
    ).toEqual({ ok: true, datos: { enCurso: null } })
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("un fallo inesperado responde un mensaje genérico", async () => {
    simulados.transicionar.mockRejectedValue(new Error("red"))
    const resultado = await suspenderMedio({
      medioId: MEDIO,
      motivo: "Fraude en métricas",
    })
    expect(resultado.ok).toBe(false)
    expect(simulados.refresh).not.toHaveBeenCalled()
  })
})

describe("reactivarMedio", () => {
  it("vuelve a VERIFICADO con motivo", async () => {
    expect(
      await reactivarMedio({
        medioId: MEDIO,
        motivo: "Se resolvió el motivo de la suspensión.",
      })
    ).toEqual({ ok: true, datos: undefined })
    expect(estado.orden).toEqual(["dal:medios.suspender", "transicionar"])
    expect(simulados.transicionar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hacia: "VERIFICADO", entidad: "medios" })
    )
  })

  it("explica que el medio ya no estaba suspendido", async () => {
    simulados.transicionar.mockResolvedValue({
      error: { code: "P0001", message: "AMO_TRANSICION_INVALIDA" },
    })
    expect(
      await reactivarMedio({ medioId: MEDIO, motivo: "Ya pagó lo pendiente" })
    ).toEqual({ ok: false, error: MENSAJES_SUSPENSION.yaNoSuspendido })
  })

  it("el motivo demasiado largo según la BD vuelve al campo", async () => {
    simulados.transicionar.mockResolvedValue({
      error: {
        code: "23514",
        message: 'violates check constraint "medios_motivo_estado_chk"',
      },
    })
    const resultado = await reactivarMedio({
      medioId: MEDIO,
      motivo: "Ya pagó lo pendiente",
    })
    expect(resultado).toEqual({
      ok: false,
      error: "El motivo admite hasta 500 caracteres.",
      erroresCampo: { motivo: ["El motivo admite hasta 500 caracteres."] },
    })
  })
})

describe("consultarAsignacionesEnCurso", () => {
  it("autoriza y devuelve las asignaciones en curso", async () => {
    const resultado = await consultarAsignacionesEnCurso({ medioId: MEDIO })
    expect(resultado.ok && resultado.datos).toHaveLength(2)
    expect(simulados.asignacionesEnCursoDelMedio).toHaveBeenCalledWith(MEDIO)
    expect(estado.orden[0]).toBe("dal:medios.suspender")
  })

  it("exige además ver asignaciones", async () => {
    estado.permisos = ["medios.suspender"]
    expect(await consultarAsignacionesEnCurso({ medioId: MEDIO })).toEqual({
      ok: false,
      error: MENSAJES_SUSPENSION.sinPermisoAsignaciones,
    })
    expect(simulados.asignacionesEnCursoDelMedio).not.toHaveBeenCalled()
  })

  it("un id inválido o un fallo de lectura se devuelven, no se lanzan", async () => {
    expect((await consultarAsignacionesEnCurso({ medioId: "x" })).ok).toBe(
      false
    )
    simulados.asignacionesEnCursoDelMedio.mockRejectedValue(new Error("x"))
    expect(await consultarAsignacionesEnCurso({ medioId: MEDIO })).toEqual({
      ok: false,
      error: MENSAJES_SUSPENSION.enCursoNoDisponible,
    })
  })
})
