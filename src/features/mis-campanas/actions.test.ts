// @vitest-environment node
/**
 * Server Actions de «Mis campañas» con el DAL, Supabase y Storage simulados:
 * el DAL va primero, descargar y desistir van por sus `*_srv` con el actor y
 * su sesión, los errores de la BD llegan en voz del medio y un archivo solo
 * se firma (como usuario) si es del contenido de ESA asignación.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const ID = "0199f3a0-0000-7000-8000-00000000a501"
const ARCHIVO = "0199f3a0-0000-7000-8000-0000000000a1"
const OFERTA = "0199f3a0-0000-7000-8000-0000000000f1"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: { id: "u1", medioId: "m1" as string | null },
  rpcServicio: [] as { nombre: string; args: Record<string, unknown> }[],
  respuestaServicio: { data: null as unknown, error: null as unknown },
  asignacion: { data: [] as unknown[], error: null as unknown },
  archivo: { data: null as unknown, error: null as unknown },
  firmas: [] as Record<string, unknown>[],
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
    return estado.usuario
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
          estado.rpcServicio.push({ nombre, args })
          return estado.respuestaServicio
        },
      },
    }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    rpc: async () => estado.asignacion,
    from: () => {
      const cadena = {
        select: () => cadena,
        eq: () => cadena,
        maybeSingle: async () => estado.archivo,
      }
      return cadena
    },
  })),
}))
vi.mock("@/lib/storage/descargas", () => ({
  firmarDescarga: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.firmas.push(opciones)
    return {
      ok: true,
      datos: { url: "https://firmada.example/x", vigenciaSegundos: 300 },
    }
  }),
}))

const { descargarContenido, desistirAsignacion, firmarArchivoContenido } =
  await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.usuario = { id: "u1", medioId: "m1" }
  estado.rpcServicio = []
  estado.respuestaServicio = { data: null, error: null }
  estado.asignacion = { data: [{ oferta_id: OFERTA }], error: null }
  estado.archivo = {
    data: {
      archivo_path: `oferta/${OFERTA}/c1/pieza.mp4`,
      mime: "video/mp4",
      orden: 0,
      creativo: { oferta_id: OFERTA, version: 2 },
    },
    error: null,
  }
  estado.firmas = []
  estado.refrescos = 0
})

describe("descargarContenido", () => {
  it("registra la descarga con actor y sesión y devuelve la versión", async () => {
    estado.respuestaServicio = { data: { version: 2 }, error: null }
    const resultado = await descargarContenido({ asignacionId: ID })
    expect(resultado).toEqual({ ok: true, datos: { version: 2 } })
    expect(estado.orden).toEqual(["dal:asignaciones.ejecutar", "contexto"])
    expect(estado.rpcServicio).toEqual([
      {
        nombre: "registrar_descarga_srv",
        args: { p_asignacion_id: ID, p_actor_id: "u1", p_session_id: "s1" },
      },
    ])
    expect(estado.refrescos).toBe(1)
  })

  it("el plazo vencido llega con el detalle de la BD, sin refrescar", async () => {
    estado.respuestaServicio = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_FUERA_DE_VENTANA",
        details:
          "Venció el plazo para publicar: ya no puedes descargar el contenido.",
      },
    }
    expect(await descargarContenido({ asignacionId: ID })).toEqual({
      ok: false,
      error:
        "Venció el plazo para publicar: ya no puedes descargar el contenido.",
    })
    expect(estado.refrescos).toBe(0)
  })

  it("un identificador inválido o una cuenta sin medio no llegan a la BD", async () => {
    expect((await descargarContenido({ asignacionId: "x" })).ok).toBe(false)
    estado.usuario = { id: "u1", medioId: null }
    expect((await descargarContenido({ asignacionId: ID })).ok).toBe(false)
    expect(estado.rpcServicio).toEqual([])
    expect(estado.orden.every((paso) => paso.startsWith("dal:"))).toBe(true)
  })
})

describe("desistirAsignacion", () => {
  it("va por desistir_asignacion_srv con el motivo limpio", async () => {
    const resultado = await desistirAsignacion({
      asignacionId: ID,
      motivo: "  Ya no tengo espacio para publicar.  ",
    })
    expect(resultado.ok).toBe(true)
    expect(estado.orden[0]).toBe("dal:ofertas.aceptar")
    expect(estado.rpcServicio[0]).toEqual({
      nombre: "desistir_asignacion_srv",
      args: {
        p_asignacion_id: ID,
        p_actor_id: "u1",
        p_session_id: "s1",
        p_motivo: "Ya no tengo espacio para publicar.",
      },
    })
    expect(estado.refrescos).toBe(1)
  })

  it("el motivo corto vuelve como error del campo", async () => {
    const resultado = await desistirAsignacion({
      asignacionId: ID,
      motivo: "no",
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.erroresCampo?.motivo?.[0]).toMatch(/al menos 5/)
    }
    expect(estado.rpcServicio).toEqual([])
  })

  it("si ya descargó, la BD lo impide con su mensaje", async () => {
    estado.respuestaServicio = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "Ya no puedes desistir de esta asignación.",
      },
    }
    expect(
      await desistirAsignacion({
        asignacionId: ID,
        motivo: "Acepté con otra cuenta.",
      })
    ).toEqual({ ok: false, error: "Ya no puedes desistir de esta asignación." })
  })
})

describe("firmarArchivoContenido", () => {
  it("firma como usuario la ruta de la fila, para ver o para guardar", async () => {
    const ver = await firmarArchivoContenido({
      asignacionId: ID,
      archivoId: ARCHIVO,
    })
    expect(ver.ok).toBe(true)
    expect(estado.orden).toEqual(["dal:asignaciones.ejecutar"])
    expect(estado.firmas[0]).toMatchObject({
      bucket: "creativos",
      ruta: `oferta/${OFERTA}/c1/pieza.mp4`,
      firmante: { como: "usuario" },
      descarga: undefined,
    })

    await firmarArchivoContenido({
      asignacionId: ID,
      archivoId: ARCHIVO,
      descargar: true,
    })
    expect(estado.firmas[1]).toMatchObject({ descarga: "contenido-v2-1.mp4" })
  })

  it("no firma un archivo de otra oferta ni de una asignación ajena", async () => {
    estado.archivo = {
      data: {
        archivo_path: "oferta/otra/c9/pieza.mp4",
        mime: "video/mp4",
        orden: 0,
        creativo: { oferta_id: "otra", version: 1 },
      },
      error: null,
    }
    const ajeno = await firmarArchivoContenido({
      asignacionId: ID,
      archivoId: ARCHIVO,
    })
    expect(ajeno.ok).toBe(false)

    estado.asignacion = { data: [], error: null }
    estado.archivo = {
      data: {
        archivo_path: `oferta/${OFERTA}/c1/pieza.mp4`,
        mime: "video/mp4",
        orden: 0,
        creativo: { oferta_id: OFERTA, version: 2 },
      },
      error: null,
    }
    expect(
      (await firmarArchivoContenido({ asignacionId: ID, archivoId: ARCHIVO }))
        .ok
    ).toBe(false)
    expect(estado.firmas).toEqual([])
  })
})
