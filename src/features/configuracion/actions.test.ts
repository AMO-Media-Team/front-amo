// @vitest-environment node
/**
 * `confirmarParametro` (CFG-001) con el DAL y Supabase simulados: autoriza
 * antes que nada, exige además el permiso de comisiones para las claves
 * `comision.*`, no confirma un valor que cambió después de que la persona lo
 * vio, no hace nada con uno ya confirmado y escribe solo la marca, con el
 * bloqueo optimista y únicamente si sigue pendiente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CAMBIO_CONCURRENTE } from "./errores"

const VERSION = "2026-10-24T12:00:00.000000+00:00"
const NUEVA_VERSION = "2026-10-24T12:05:00.000000+00:00"

type Respuesta = { data: unknown; error: unknown }

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: ["configuracion.editar"] as string[],
  /** Respuestas en el orden en que se piden (lectura, escritura, relectura). */
  respuestas: [] as { data: unknown; error: unknown }[],
  cambios: [] as unknown[],
  filtros: [] as [string, unknown][],
}))

const simulados = vi.hoisted(() => ({ refresh: vi.fn() }))

function siguiente(): Respuesta {
  return (
    estado.respuestas.shift() ?? { data: null, error: { code: "sin-dato" } }
  )
}

/** Consulta encadenable de PostgREST sobre `configuracion`. */
function consulta() {
  const cadena: Record<string, unknown> = {
    select: () => cadena,
    update: (cambios: unknown) => {
      estado.cambios.push(cambios)
      return cadena
    },
    eq: (columna: string, valor: unknown) => {
      estado.filtros.push([columna, valor])
      return cadena
    },
    maybeSingle: async () => siguiente(),
    then: (resolver: (valor: unknown) => unknown) =>
      Promise.resolve(siguiente()).then(resolver),
  }
  return cadena
}

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", permisos: estado.permisos }
  }),
  tieneAlgunPermiso: (
    usuario: { permisos: string[] },
    permisos: readonly string[]
  ) => permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => {
    estado.orden.push("cliente")
    return { from: () => consulta() }
  }),
}))
vi.mock("./queries", () => ({}))

const { confirmarParametro } = await import("./actions")

const ENTRADA = {
  clave: "privacidad.plazo_consulta_dias",
  actualizadoAt: VERSION,
}

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.permisos = ["configuracion.editar"]
  estado.respuestas = []
  estado.cambios = []
  estado.filtros = []
})

describe("confirmarParametro", () => {
  it("retira la marca con bloqueo optimista y solo si sigue pendiente", async () => {
    estado.respuestas = [
      {
        data: { pendiente_validacion: true, updated_at: VERSION },
        error: null,
      },
      { data: [{ updated_at: NUEVA_VERSION }], error: null },
    ]
    const resultado = await confirmarParametro(ENTRADA)

    expect(resultado).toEqual({
      ok: true,
      datos: { actualizadoAt: NUEVA_VERSION },
    })
    expect(estado.orden[0]).toBe("dal:configuracion.editar")
    expect(estado.cambios).toEqual([{ pendiente_validacion: false }])
    expect(estado.filtros).toEqual(
      expect.arrayContaining([
        ["clave", ENTRADA.clave],
        ["updated_at", VERSION],
        ["pendiente_validacion", true],
      ])
    )
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("no confirma un valor que otra persona cambió mientras lo veía", async () => {
    estado.respuestas = [
      {
        data: { pendiente_validacion: true, updated_at: NUEVA_VERSION },
        error: null,
      },
    ]
    const resultado = await confirmarParametro(ENTRADA)

    expect(resultado).toMatchObject({ ok: false, error: CAMBIO_CONCURRENTE })
    expect(estado.cambios).toEqual([])
    // La página se vuelve a pintar con el valor vigente.
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("un parámetro ya confirmado no se vuelve a escribir", async () => {
    estado.respuestas = [
      {
        data: { pendiente_validacion: false, updated_at: NUEVA_VERSION },
        error: null,
      },
    ]
    const resultado = await confirmarParametro(ENTRADA)

    expect(resultado).toEqual({
      ok: true,
      datos: { actualizadoAt: NUEVA_VERSION },
    })
    expect(estado.cambios).toEqual([])
  })

  it("si la escritura no tocó filas porque cambió la versión, lo explica", async () => {
    estado.respuestas = [
      {
        data: { pendiente_validacion: true, updated_at: VERSION },
        error: null,
      },
      { data: [], error: null },
      { data: { updated_at: NUEVA_VERSION }, error: null },
    ]
    const resultado = await confirmarParametro(ENTRADA)
    expect(resultado).toMatchObject({ ok: false, error: CAMBIO_CONCURRENTE })
  })

  it("la comisión exige además el permiso de comisiones", async () => {
    const resultado = await confirmarParametro({
      clave: "comision.porcentaje_global",
      actualizadoAt: VERSION,
    })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:configuracion.editar"])
  })

  it("rechaza una entrada sin versión sin tocar la base", async () => {
    const resultado = await confirmarParametro({
      clave: ENTRADA.clave,
      actualizadoAt: "",
    })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:configuracion.editar"])
  })
})
