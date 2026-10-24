// @vitest-environment node
/**
 * Acciones de las liquidaciones con el DAL, las RPC, la transición, Storage
 * y las lecturas simulados: autorizan antes que nada, validan con el mismo
 * esquema que el diálogo, mandan a la BD exactamente lo decidido, traducen
 * los `hint` de la fase y revalidan las vistas, la ficha y los pagos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJE_MEDIO_SIN_LIQUIDAR, MENSAJES_LIQUIDACION } from "./errores"
import { TEXTO_REQUIERE_NOTA_AJUSTE } from "./presentacion"
import { MENSAJES_PERIODO } from "./schemas"

const LIQ = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const LIQ_2 = "0192f3a4-5b6c-7d8e-9f01-0000000000a2"
const MEDIO = "0192f3a4-5b6c-7d8e-9f01-0000000000c1"
const ARCHIVO_UUID = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  rpc: [] as { nombre: string; argumentos: Record<string, unknown> }[],
  respuesta: { data: null as unknown, error: null as unknown },
  transiciones: [] as unknown[],
  erroresTransicion: [] as unknown[],
  revalidadas: [] as string[],
  subidas: [] as unknown[],
  confirmaciones: [] as unknown[],
  confirmacion: { ok: true, datos: {} } as unknown,
  firmas: [] as unknown[],
  ruta: { ruta: null as string | null, existe: true },
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((ruta: string) => {
    estado.revalidadas.push(ruta)
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", permisos: [permiso], rol: { clave: "FINANZAS" } }
  }),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => {
    estado.orden.push("contexto")
    return {
      actorId: "u1",
      sessionId: "s1",
      admin: {
        rpc: async (nombre: string, argumentos: Record<string, unknown>) => {
          estado.rpc.push({ nombre, argumentos })
          return estado.respuesta
        },
      },
    }
  }),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(async (_contexto: unknown, solicitud: unknown) => {
    estado.transiciones.push(solicitud)
    return { data: null, error: estado.erroresTransicion.shift() ?? null }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({ sesion: true })),
}))
vi.mock("@/lib/storage/subidas", () => ({
  prepararSubidaFirmada: vi.fn(async (opciones: unknown) => {
    estado.subidas.push(opciones)
    return { ok: true, datos: { preparada: true } }
  }),
  confirmarObjeto: vi.fn(async (opciones: unknown) => {
    estado.confirmaciones.push(opciones)
    return estado.confirmacion
  }),
}))
vi.mock("@/lib/storage/descargas", () => ({
  firmarDescarga: vi.fn(async (opciones: unknown) => {
    estado.firmas.push(opciones)
    return { ok: true, datos: { url: "https://firmada", vigenciaSegundos: 60 } }
  }),
}))
vi.mock("./queries", () => ({
  rutaArchivoLiquidacion: vi.fn(async () => estado.ruta),
}))

const {
  anularLiquidacion,
  aprobarLiquidaciones,
  descargarArchivoLiquidacion,
  generarCorte,
  generarLiquidacion,
  prepararFacturaMedioInterna,
  registrarFacturaMedioInterna,
} = await import("./actions")

const REVALIDADAS_BASE = ["/finanzas/liquidaciones", "/finanzas/pagos"]

beforeEach(() => {
  estado.orden = []
  estado.rpc = []
  estado.respuesta = { data: null, error: null }
  estado.transiciones = []
  estado.erroresTransicion = []
  estado.revalidadas = []
  estado.subidas = []
  estado.confirmaciones = []
  estado.confirmacion = { ok: true, datos: {} }
  estado.firmas = []
  estado.ruta = { ruta: null, existe: true }
})

describe("generarCorte (LIQ-001)", () => {
  it("autoriza, llama al corte con actor y sesión y devuelve el resultado por medio", async () => {
    estado.respuesta = {
      data: [
        {
          medio_id: MEDIO,
          medio: "Radio Pasto",
          liquidacion_id: LIQ,
          error: null,
        },
        {
          medio_id: "m2",
          medio: "Noticias",
          liquidacion_id: null,
          error: "Ya hay una liquidación del medio que cubre ese periodo.",
        },
        {
          medio_id: "m3",
          medio: "Creador",
          liquidacion_id: null,
          error: "canceling statement due to lock timeout",
        },
      ],
      error: null,
    }
    const resultado = await generarCorte({
      inicio: "2026-10-01",
      fin: "2026-10-15",
    })
    expect(estado.orden).toEqual(["dal:liquidaciones.generar", "contexto"])
    expect(estado.rpc).toEqual([
      {
        nombre: "generar_liquidaciones_corte_srv",
        argumentos: {
          p_periodo_inicio: "2026-10-01",
          p_periodo_fin: "2026-10-15",
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          medioId: MEDIO,
          medio: "Radio Pasto",
          liquidacionId: LIQ,
          error: null,
        },
        {
          medioId: "m2",
          medio: "Noticias",
          liquidacionId: null,
          error: "Ya hay una liquidación del medio que cubre ese periodo.",
        },
        {
          medioId: "m3",
          medio: "Creador",
          liquidacionId: null,
          error: MENSAJE_MEDIO_SIN_LIQUIDAR,
        },
      ],
    })
    expect(estado.revalidadas).toEqual(REVALIDADAS_BASE)
  })

  it("un periodo abierto no llega a la BD y el error va al último día", async () => {
    const resultado = await generarCorte({
      inicio: "2099-01-01",
      fin: "2099-01-15",
    })
    expect(estado.rpc).toEqual([])
    expect(resultado).toEqual({
      ok: false,
      error: expect.any(String),
      erroresCampo: { fin: [MENSAJES_PERIODO.abierto] },
    })
  })

  it("el hint periodo_abierto de la BD también va al último día", async () => {
    estado.respuesta = {
      data: null,
      error: {
        message: "AMO_TRANSICION_INVALIDA",
        details: "Indica un periodo cerrado: liquídalo desde su último día.",
        hint: "periodo_abierto",
      },
    }
    const resultado = await generarCorte({
      inicio: "2026-10-01",
      fin: "2026-10-15",
    })
    expect(resultado).toEqual({
      ok: false,
      error: "Indica un periodo cerrado: liquídalo desde su último día.",
      erroresCampo: {
        fin: ["Indica un periodo cerrado: liquídalo desde su último día."],
      },
    })
    expect(estado.revalidadas).toEqual([])
  })
})

describe("generarLiquidacion", () => {
  it("liquida un medio y devuelve el id para abrir su ficha", async () => {
    estado.respuesta = { data: LIQ, error: null }
    const resultado = await generarLiquidacion({
      medioId: MEDIO,
      inicio: "2026-10-01",
      fin: "2026-10-15",
    })
    expect(estado.rpc[0]).toEqual({
      nombre: "generar_liquidacion_srv",
      argumentos: {
        p_medio_id: MEDIO,
        p_periodo_inicio: "2026-10-01",
        p_periodo_fin: "2026-10-15",
        p_actor_id: "u1",
        p_session_id: "s1",
      },
    })
    expect(resultado).toEqual({ ok: true, datos: { liquidacionId: LIQ } })
  })

  it("un traslape llega con el detalle de la BD", async () => {
    estado.respuesta = {
      data: null,
      error: {
        message: "AMO_TRANSICION_INVALIDA",
        details: "Ya hay una liquidación del medio que cubre ese periodo.",
      },
    }
    expect(
      await generarLiquidacion({
        medioId: MEDIO,
        inicio: "2026-10-01",
        fin: "2026-10-15",
      })
    ).toEqual({
      ok: false,
      error: "Ya hay una liquidación del medio que cubre ese periodo.",
    })
  })
})

describe("aprobarLiquidaciones (LIQ-003, D17)", () => {
  it("aprueba una a una y dice por qué no se aprobó cada una", async () => {
    estado.erroresTransicion = [
      null,
      {
        message: "AMO_NO_AUTORIZADO",
        details: "Quien genera una liquidación no puede aprobarla.",
      },
    ]
    const resultado = await aprobarLiquidaciones({
      liquidacionIds: [LIQ, LIQ_2],
    })
    expect(estado.orden).toEqual(["dal:liquidaciones.aprobar", "contexto"])
    expect(estado.transiciones).toEqual([
      { entidad: "liquidaciones", id: LIQ, hacia: "APROBADA" },
      { entidad: "liquidaciones", id: LIQ_2, hacia: "APROBADA" },
    ])
    expect(resultado).toEqual({
      ok: true,
      datos: [
        { liquidacionId: LIQ, ok: true, error: null },
        {
          liquidacionId: LIQ_2,
          ok: false,
          error: "Quien genera una liquidación no puede aprobarla.",
        },
      ],
    })
    expect(estado.revalidadas).toEqual([
      "/finanzas/liquidaciones",
      `/finanzas/liquidaciones/${LIQ}`,
      `/finanzas/liquidaciones/${LIQ_2}`,
      "/finanzas/pagos",
    ])
  })

  it("sin selección no llega a la BD", async () => {
    expect(await aprobarLiquidaciones({ liquidacionIds: [] })).toMatchObject({
      ok: false,
    })
    expect(estado.transiciones).toEqual([])
  })
})

describe("anularLiquidacion (LIQ-007, D38)", () => {
  it("anula con el motivo y revalida la ficha", async () => {
    const resultado = await anularLiquidacion({
      liquidacionId: LIQ,
      motivo: "Error en el corte",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "liquidaciones",
        id: LIQ,
        hacia: "ANULADA",
        motivo: "Error en el corte",
      },
    ])
    expect(resultado).toEqual({ ok: true, datos: undefined })
    expect(estado.revalidadas).toContain(`/finanzas/liquidaciones/${LIQ}`)
  })

  it("con el documento transmitido, pide la nota de ajuste", async () => {
    estado.erroresTransicion = [
      {
        message: "AMO_TRANSICION_INVALIDA",
        details: "El documento soporte ya se transmitió…",
        hint: "requiere_nota_ajuste",
      },
    ]
    expect(
      await anularLiquidacion({
        liquidacionId: LIQ,
        motivo: "Error en el corte",
      })
    ).toEqual({ ok: false, error: TEXTO_REQUIERE_NOTA_AJUSTE })
  })

  it("sin motivo suficiente no llega a la BD", async () => {
    const resultado = await anularLiquidacion({
      liquidacionId: LIQ,
      motivo: "x",
    })
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { motivo: [expect.any(String)] },
    })
    expect(estado.transiciones).toEqual([])
  })
})

describe("factura del medio (LIQ-004, D83)", () => {
  const descripcion = {
    nombre: "factura.pdf",
    tipo: "application/pdf",
    tamano: 2048,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: false,
  }
  const RUTA = `liquidacion/${LIQ}/factura/${ARCHIVO_UUID}.pdf`

  it("firma la subida en la carpeta de la factura, con la sesión", async () => {
    const resultado = await prepararFacturaMedioInterna({
      liquidacionId: LIQ,
      archivo: descripcion,
    })
    expect(estado.orden).toEqual(["dal:liquidaciones.registrar_pago"])
    expect(resultado.ok).toBe(true)
    expect(estado.subidas).toEqual([
      {
        cliente: { sesion: true },
        bucket: "soportes",
        ruta: expect.stringMatching(
          new RegExp(`^liquidacion/${LIQ}/factura/[0-9a-f-]{36}\\.pdf$`)
        ),
      },
    ])
  })

  it("no prepara una imagen", async () => {
    const resultado = await prepararFacturaMedioInterna({
      liquidacionId: LIQ,
      archivo: { ...descripcion, tipo: "image/png" },
    })
    expect(resultado.ok).toBe(false)
    expect(estado.subidas).toEqual([])
  })

  it("comprueba el objeto como servicio y registra número en mayúsculas y ruta", async () => {
    const resultado = await registrarFacturaMedioInterna({
      liquidacionId: LIQ,
      numero: "fe-1234",
      archivo: {
        ...descripcion,
        bucket: "soportes",
        ruta: RUTA,
        rutaMiniatura: null,
      },
    })
    expect(estado.confirmaciones).toEqual([
      {
        cliente: expect.objectContaining({ rpc: expect.any(Function) }),
        bucket: "soportes",
        ruta: RUTA,
        esperado: { tamano: 2048, tipo: "application/pdf" },
      },
    ])
    expect(estado.rpc).toEqual([
      {
        nombre: "registrar_factura_medio_srv",
        argumentos: {
          p_liquidacion_id: LIQ,
          p_numero: "FE-1234",
          p_archivo_path: RUTA,
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })

  it("rechaza una ruta de otra carpeta sin tocar Storage ni la BD", async () => {
    const resultado = await registrarFacturaMedioInterna({
      liquidacionId: LIQ,
      numero: "FE-1",
      archivo: {
        ...descripcion,
        bucket: "soportes",
        ruta: `liquidacion/${LIQ_2}/factura/${ARCHIVO_UUID}.pdf`,
        rutaMiniatura: null,
      },
    })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_LIQUIDACION.archivoAjeno,
      erroresCampo: { archivo: [MENSAJES_LIQUIDACION.archivoAjeno] },
    })
    expect(estado.confirmaciones).toEqual([])
    expect(estado.rpc).toEqual([])
  })
})

describe("descargarArchivoLiquidacion", () => {
  it("firma como servicio la ruta de la fila, con nombre legible", async () => {
    estado.ruta = {
      ruta: `liquidacion/${LIQ}/pago/${ARCHIVO_UUID}.pdf`,
      existe: true,
    }
    const resultado = await descargarArchivoLiquidacion({
      liquidacionId: LIQ,
      archivo: "soporte_pago",
    })
    expect(estado.orden[0]).toBe("dal:liquidaciones.ver")
    expect(estado.firmas).toEqual([
      {
        bucket: "soportes",
        ruta: `liquidacion/${LIQ}/pago/${ARCHIVO_UUID}.pdf`,
        firmante: {
          como: "servicio",
          contexto: expect.objectContaining({ actorId: "u1" }),
          entidad: "liquidaciones",
          entidadId: LIQ,
        },
        descarga: "Soporte de pago LIQ-0192f3a4.pdf",
      },
    ])
    expect(resultado).toEqual({
      ok: true,
      datos: { url: "https://firmada", vigenciaSegundos: 60 },
    })
  })

  it("sin archivo o sin liquidación, lo dice sin firmar", async () => {
    estado.ruta = { ruta: null, existe: true }
    expect(
      await descargarArchivoLiquidacion({
        liquidacionId: LIQ,
        archivo: "factura_medio",
      })
    ).toEqual({ ok: false, error: MENSAJES_LIQUIDACION.sinArchivo })
    estado.ruta = { ruta: null, existe: false }
    expect(
      await descargarArchivoLiquidacion({
        liquidacionId: LIQ,
        archivo: "factura_medio",
      })
    ).toEqual({ ok: false, error: MENSAJES_LIQUIDACION.noEncontrada })
    expect(estado.firmas).toEqual([])
  })
})
