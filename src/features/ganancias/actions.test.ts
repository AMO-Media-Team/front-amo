// @vitest-environment node
/**
 * Server Actions de «Ganancias» con el DAL, Supabase y Storage simulados: el
 * DAL va primero, los archivos se firman como usuario con la ruta de la fila
 * que devuelve la RPC del medio (nunca del cliente), la factura se sube a su
 * carpeta y se registra por `registrar_factura_medio_srv` con actor y sesión,
 * y los errores de la BD llegan en su campo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { filaLiquidacion, ID_DOCUMENTO, ID_LIQUIDACION } from "./fixtures"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  usuario: { id: "u1", medioId: "m1" as string | null },
  rpcSesion: [] as { nombre: string; args: Record<string, unknown> }[],
  respuestaSesion: { data: [] as unknown[], error: null as unknown },
  rpcServicio: [] as { nombre: string; args: Record<string, unknown> }[],
  respuestaServicio: { data: null as unknown, error: null as unknown },
  firmas: [] as Record<string, unknown>[],
  subidas: [] as Record<string, unknown>[],
  confirmaciones: [] as Record<string, unknown>[],
  respuestaConfirmar: { ok: true } as { ok: boolean; error?: string },
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
const clienteSesion = vi.hoisted(() => ({
  rpc: async (nombre: string, args: Record<string, unknown>) => {
    estado.rpcSesion.push({ nombre, args })
    return estado.respuestaSesion
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => clienteSesion),
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
vi.mock("@/lib/storage/subidas", () => ({
  prepararSubidaFirmada: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.subidas.push(opciones)
    return {
      ok: true,
      datos: {
        bucket: opciones.bucket,
        ruta: opciones.ruta,
        token: "t",
        miniatura: null,
      },
    }
  }),
  confirmarObjeto: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.confirmaciones.push(opciones)
    return estado.respuestaConfirmar.ok
      ? { ok: true, datos: opciones }
      : { ok: false, error: estado.respuestaConfirmar.error }
  }),
}))

const {
  cargarPagos,
  confirmarFacturaMedio,
  firmarArchivoLiquidacion,
  prepararFacturaMedio,
  registrarFacturaMedio,
} = await import("./actions")

const CARPETA_FACTURA = `liquidacion/${ID_LIQUIDACION}/factura`
const RUTA_FACTURA = `${CARPETA_FACTURA}/0199f3a0-0000-7000-8000-00000000f001.pdf`
const PDF = {
  nombre: "factura.pdf",
  tipo: "application/pdf",
  tamano: 120_000,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: false,
}

beforeEach(() => {
  estado.orden = []
  estado.usuario = { id: "u1", medioId: "m1" }
  estado.rpcSesion = []
  estado.respuestaSesion = { data: [filaLiquidacion()], error: null }
  estado.rpcServicio = []
  estado.respuestaServicio = { data: null, error: null }
  estado.firmas = []
  estado.subidas = []
  estado.confirmaciones = []
  estado.respuestaConfirmar = { ok: true }
  estado.refrescos = 0
})

describe("cargarPagos", () => {
  it("pide la página siguiente por cursor con la sesión", async () => {
    const resultado = await cargarPagos({ antesId: ID_LIQUIDACION })
    expect(resultado.ok).toBe(true)
    expect(estado.orden).toEqual(["dal:liquidaciones.ver_propias"])
    expect(estado.rpcSesion).toEqual([
      {
        nombre: "mis_liquidaciones_medio",
        args: { p_limite: 13, p_antes_id: ID_LIQUIDACION, p_id: null },
      },
    ])
  })

  it("un cursor inválido no llega a la BD", async () => {
    expect((await cargarPagos({ antesId: "x" })).ok).toBe(false)
    expect(estado.rpcSesion).toEqual([])
  })
})

describe("firmarArchivoLiquidacion", () => {
  it("firma como usuario la ruta de la fila, con un nombre legible", async () => {
    const resultado = await firmarArchivoLiquidacion({
      liquidacionId: ID_LIQUIDACION,
      archivo: "documento_soporte",
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { url: "https://firmada.example/x", vigenciaSegundos: 300 },
    })
    expect(estado.rpcSesion[0]).toEqual({
      nombre: "mis_liquidaciones_medio",
      args: { p_limite: 1, p_antes_id: null, p_id: ID_LIQUIDACION },
    })
    expect(estado.firmas).toEqual([
      {
        bucket: "soportes",
        ruta: `documento_soporte/${ID_DOCUMENTO}/d.pdf`,
        firmante: { como: "usuario", cliente: clienteSesion },
        descarga: "Documento soporte DSF2.pdf",
      },
    ])
  })

  it("sin la liquidación (de otro medio o anulada) o sin archivo, no firma", async () => {
    estado.respuestaSesion = { data: [], error: null }
    expect(
      await firmarArchivoLiquidacion({
        liquidacionId: ID_LIQUIDACION,
        archivo: "soporte_pago",
      })
    ).toEqual({
      ok: false,
      error:
        "No encontramos esa liquidación o ya no tienes acceso a ella. Actualiza la página.",
    })
    estado.respuestaSesion = {
      data: [filaLiquidacion({ factura_medio_path: null })],
      error: null,
    }
    const sinArchivo = await firmarArchivoLiquidacion({
      liquidacionId: ID_LIQUIDACION,
      archivo: "factura",
    })
    expect(sinArchivo.ok).toBe(false)
    expect(estado.firmas).toEqual([])
  })

  it("una anulada (la RPC la devuelve por id) ya no tiene archivos", async () => {
    estado.respuestaSesion = {
      data: [filaLiquidacion({ estado: "ANULADA" })],
      error: null,
    }
    expect(
      await firmarArchivoLiquidacion({
        liquidacionId: ID_LIQUIDACION,
        archivo: "soporte_pago",
      })
    ).toEqual({
      ok: false,
      error:
        "Esta liquidación se anuló: ya no tiene archivos para descargar. Actualiza la página.",
    })
    expect(estado.firmas).toEqual([])
  })

  it("un archivo que no es de la lista no se acepta", async () => {
    const resultado = await firmarArchivoLiquidacion({
      liquidacionId: ID_LIQUIDACION,
      archivo: "datos_pago" as "factura",
    })
    expect(resultado.ok).toBe(false)
    expect(estado.rpcSesion).toEqual([])
  })
})

describe("factura del medio", () => {
  it("preparar firma la subida en la carpeta de la factura, con la sesión", async () => {
    const resultado = await prepararFacturaMedio({
      liquidacionId: ID_LIQUIDACION,
      descripcion: PDF,
    })
    expect(resultado.ok).toBe(true)
    expect(estado.subidas).toHaveLength(1)
    expect(estado.subidas[0]).toMatchObject({
      cliente: clienteSesion,
      bucket: "soportes",
    })
    expect(String(estado.subidas[0].ruta)).toMatch(
      new RegExp(`^${CARPETA_FACTURA}/[0-9a-f-]{36}\\.pdf$`)
    )
  })

  it("preparar rechaza lo que no es PDF y la cuenta sin medio", async () => {
    expect(
      (
        await prepararFacturaMedio({
          liquidacionId: ID_LIQUIDACION,
          descripcion: { ...PDF, tipo: "image/png" },
        })
      ).ok
    ).toBe(false)
    estado.usuario = { id: "u1", medioId: null }
    expect(
      (
        await prepararFacturaMedio({
          liquidacionId: ID_LIQUIDACION,
          descripcion: PDF,
        })
      ).ok
    ).toBe(false)
    expect(estado.subidas).toEqual([])
  })

  it("confirmar comprueba la carpeta antes de mirar Storage", async () => {
    const archivo = {
      ...PDF,
      bucket: "soportes" as const,
      ruta: RUTA_FACTURA,
      rutaMiniatura: null,
    }
    expect(
      await confirmarFacturaMedio({ liquidacionId: ID_LIQUIDACION, archivo })
    ).toEqual({ ok: true, datos: undefined })
    expect(estado.confirmaciones[0]).toMatchObject({
      ruta: RUTA_FACTURA,
      esperado: { tamano: 120_000, tipo: "application/pdf" },
    })

    const ajena = await confirmarFacturaMedio({
      liquidacionId: ID_LIQUIDACION,
      archivo: {
        ...archivo,
        ruta: `liquidacion/${ID_LIQUIDACION}/pago/0199f3a0-0000-7000-8000-00000000f001.pdf`,
      },
    })
    expect(ajena.ok).toBe(false)
    expect(estado.confirmaciones).toHaveLength(1)
  })

  it("registrar va por registrar_factura_medio_srv con actor, sesión y número en mayúsculas", async () => {
    const resultado = await registrarFacturaMedio({
      liquidacionId: ID_LIQUIDACION,
      numero: " fe-1234 ",
      archivoPath: RUTA_FACTURA,
    })
    expect(resultado).toEqual({ ok: true, datos: undefined })
    expect(estado.orden).toEqual(["dal:liquidaciones.ver_propias", "contexto"])
    expect(estado.rpcServicio).toEqual([
      {
        nombre: "registrar_factura_medio_srv",
        args: {
          p_liquidacion_id: ID_LIQUIDACION,
          p_numero: "FE-1234",
          p_archivo_path: RUTA_FACTURA,
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(estado.refrescos).toBe(1)
  })

  it("una ruta fuera de la carpeta de la factura no llega a la BD", async () => {
    const resultado = await registrarFacturaMedio({
      liquidacionId: ID_LIQUIDACION,
      numero: "FE-1",
      archivoPath: `documento_soporte/${ID_DOCUMENTO}/d.pdf`,
    })
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.erroresCampo?.archivo).toBeTruthy()
    expect(estado.rpcServicio).toEqual([])
  })

  it("los errores de la BD llegan a su campo, sin refrescar", async () => {
    estado.respuestaServicio = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Carga el PDF de la factura.",
        hint: "archivo_no_cargado",
      },
    }
    const sinArchivo = await registrarFacturaMedio({
      liquidacionId: ID_LIQUIDACION,
      numero: "FE-1",
      archivoPath: RUTA_FACTURA,
    })
    expect(!sinArchivo.ok && sinArchivo.erroresCampo).toEqual({
      archivo: [
        "El PDF de la factura no terminó de subir. Elígelo de nuevo y vuelve a enviarla.",
      ],
    })

    estado.respuestaServicio = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "La liquidación ya no admite cambios.",
      },
    }
    expect(
      await registrarFacturaMedio({
        liquidacionId: ID_LIQUIDACION,
        numero: "FE-1",
        archivoPath: RUTA_FACTURA,
      })
    ).toEqual({ ok: false, error: "La liquidación ya no admite cambios." })
    expect(estado.refrescos).toBe(0)
  })
})
