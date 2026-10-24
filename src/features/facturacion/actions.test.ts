// @vitest-environment node
/**
 * Acciones de la facturación con el DAL, las RPC, la transición, la bitácora,
 * Storage y las lecturas simulados: autorizan antes que nada, comprueban la
 * carpeta del archivo antes de llamar a la BD, mandan exactamente lo escrito
 * (ya normalizado), traducen los `hint` de la fase y revalidan la ficha, el
 * listado y la cartera.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJES_FACTURACION } from "./errores"
import type { FichaFactura, LineaFactura } from "./tipos"

const FACTURA = "0192f3a4-5b6c-7d8e-9f01-00000000fa01"
const ANUNCIANTE = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const PAGO = "0192f3a4-5b6c-7d8e-9f01-0000000000b1"
const CUFE = "ab12".repeat(24)
const PDF = `factura/${FACTURA}/0192f3a4-5b6c-7d8e-9f01-0000000000f1.pdf`
const SOPORTE = `pago/${FACTURA}/0192f3a4-5b6c-7d8e-9f01-0000000000f2.png`

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: [] as string[],
  rpc: [] as { nombre: string; argumentos: Record<string, unknown> }[],
  respuestas: {} as Record<string, { data: unknown; error: unknown }>,
  transiciones: [] as unknown[],
  eventos: [] as unknown[],
  eventoRegistrado: true,
  revalidadas: [] as string[],
  filas: {} as Record<string, unknown>,
  firmas: [] as unknown[],
  factura: null as unknown,
  lineas: [] as unknown[],
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((ruta: string) => {
    estado.revalidadas.push(ruta)
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string | string[]) => {
    estado.orden.push(`dal:${[permiso].flat().join("|")}`)
    return { id: "u1", permisos: estado.permisos }
  }),
  tieneAlgunPermiso: (usuario: { permisos: string[] }, permisos: string[]) =>
    permisos.some((permiso) => usuario.permisos.includes(permiso)),
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
          return estado.respuestas[nombre] ?? { data: null, error: null }
        },
      },
    }
  }),
}))
vi.mock("@/lib/auth/registro", () => ({
  registrarEvento: vi.fn(async (evento: unknown) => {
    estado.eventos.push(evento)
    return estado.eventoRegistrado
  }),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(async (_contexto: unknown, solicitud: unknown) => {
    estado.transiciones.push(solicitud)
    return { data: null, error: null }
  }),
}))
vi.mock("@/lib/storage/descargas", () => ({
  firmarDescarga: vi.fn(async (opciones: unknown) => {
    estado.firmas.push(opciones)
    return { ok: true, datos: { url: "https://firmada", vigenciaSegundos: 60 } }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    from: (tabla: string) => {
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        maybeSingle: async () => ({
          data: estado.filas[tabla] ?? null,
          error: null,
        }),
      }
      return consulta
    },
  })),
}))
vi.mock("@/features/operacion/queries/comun", () => ({
  nombreMunicipio: () => "Pasto",
  nombreDepartamento: () => "Nariño",
}))
vi.mock("./queries", () => ({
  obtenerFactura: vi.fn(async () => estado.factura),
  lineasFactura: vi.fn(async () => estado.lineas),
  pendientesFacturacion: vi.fn(async () => []),
}))

const {
  anularBorradorFactura,
  firmarArchivoFactura,
  generarArchivoCarga,
  generarFactura,
  registrarFacturaExpedida,
  registrarNotaCredito,
  registrarPagoFactura,
} = await import("./actions")

const RUTAS = [
  `/finanzas/facturas/${FACTURA}`,
  "/finanzas/facturas",
  "/finanzas/cartera",
]

function linea(cambios: Partial<LineaFactura> = {}): LineaFactura {
  return {
    asignacionId: "0192f3a4-5b6c-7d8e-9f01-0000000000c1",
    estado: "VERIFICADA",
    campanaId: "c1",
    campana: "Navidad",
    medioId: "m1",
    medio: "Radio Pasto",
    plataforma: "INSTAGRAM",
    oferta: "Reel",
    montoBruto: 1_000_000,
    montoComision: 200_000,
    montoMedio: 800_000,
    verificadaAt: "2026-10-20T15:00:00Z",
    ...cambios,
  }
}

function factura(cambios: Partial<FichaFactura> = {}): FichaFactura {
  return {
    id: FACTURA,
    numero: null,
    prefijo: null,
    consecutivo: null,
    estado: "BORRADOR",
    esquema: "COMPRA_REVENTA",
    porcentajeIva: 0.19,
    periodoDesde: "2026-10-01",
    periodoHasta: "2026-10-22",
    fechaEmision: null,
    fechaVencimiento: null,
    subtotal: 1_000_000,
    iva: 190_000,
    valorTerceros: 0,
    total: 1_190_000,
    pagado: 0,
    valorNotasCredito: 0,
    saldo: 1_190_000,
    cufe: null,
    tieneArchivo: false,
    emitidaAt: null,
    pagadaAt: null,
    vencidaAt: null,
    anuladaAt: null,
    creadaAt: "2026-10-23T15:00:00Z",
    esDemo: false,
    anuncianteId: ANUNCIANTE,
    anunciante: {
      id: ANUNCIANTE,
      nombreComercial: "Tienda La 14",
      razonSocial: "Tiendas La Catorce S.A.S.",
      nit: "900123456",
      digitoVerificacion: "7",
      identificacionExtranjera: null,
      paisIso2: "CO",
      municipioCodigo: "52001",
      datosFacturacion: {},
      facturacion: {
        email: "facturas@la14.co",
        regimen: "RESPONSABLE_IVA",
        granContribuyente: false,
        autorretenedor: false,
      },
    },
    campana: null,
    resolucion: null,
    ...cambios,
  }
}

beforeEach(() => {
  estado.orden = []
  estado.permisos = ["facturas.ver", "facturas.gestionar", "pagos.registrar"]
  estado.rpc = []
  estado.respuestas = {}
  estado.transiciones = []
  estado.eventos = []
  estado.eventoRegistrado = true
  estado.revalidadas = []
  estado.filas = {}
  estado.firmas = []
  estado.factura = factura()
  estado.lineas = [linea()]
})

describe("generarFactura", () => {
  const entrada = {
    anuncianteId: ANUNCIANTE,
    campanaId: null,
    desde: "2026-10-01",
    hasta: "2020-10-22",
  }

  it("genera el borrador después del DAL con el periodo y devuelve su id", async () => {
    estado.respuestas.generar_factura_srv = { data: FACTURA, error: null }
    const resultado = await generarFactura({ ...entrada, desde: "2020-10-01" })
    expect(estado.orden).toEqual(["dal:facturas.gestionar", "contexto"])
    expect(estado.rpc).toEqual([
      {
        nombre: "generar_factura_srv",
        argumentos: {
          p_anunciante_id: ANUNCIANTE,
          p_campana_id: null,
          p_periodo_desde: "2020-10-01",
          p_periodo_hasta: "2020-10-22",
          p_actor_id: "u1",
          p_session_id: "s1",
        },
      },
    ])
    expect(resultado).toEqual({ ok: true, datos: { facturaId: FACTURA } })
    expect(estado.revalidadas).toContain("/finanzas/facturas")
  })

  it("sin nada por facturar, lo dice en la fecha de corte", async () => {
    estado.respuestas.generar_factura_srv = {
      data: null,
      error: { message: "AMO_TRANSICION_INVALIDA", hint: "sin_asignaciones" },
    }
    const resultado = await generarFactura({ ...entrada, desde: "2020-10-01" })
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_FACTURACION.sinAsignaciones,
      erroresCampo: { hasta: [MENSAJES_FACTURACION.sinAsignaciones] },
    })
  })
})

describe("registrarFacturaExpedida (LIQ-008 c1)", () => {
  const entrada = {
    facturaId: FACTURA,
    prefijo: "fe",
    consecutivo: "1234",
    fechaEmision: "2020-10-23",
    fechaVencimiento: "",
    cufe: CUFE.toUpperCase(),
    total: "1.190.000",
    archivoPath: PDF,
  }

  it("manda lo escrito normalizado y revalida ficha, listado y cartera", async () => {
    estado.respuestas.registrar_factura_expedida_srv = {
      data: { numero: "FE1234", fecha_vencimiento: "2020-11-22" },
      error: null,
    }
    const resultado = await registrarFacturaExpedida(entrada)
    expect(estado.rpc[0]).toEqual({
      nombre: "registrar_factura_expedida_srv",
      argumentos: {
        p_factura_id: FACTURA,
        p_prefijo: "FE",
        p_consecutivo: 1234,
        p_cufe: CUFE,
        p_fecha_emision: "2020-10-23",
        p_fecha_vencimiento: null,
        p_total: 1_190_000,
        p_archivo_path: PDF,
        p_actor_id: "u1",
        p_session_id: "s1",
      },
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { numero: "FE1234", fechaVencimiento: "2020-11-22" },
    })
    expect(estado.revalidadas).toEqual(RUTAS)
  })

  it("un PDF fuera de la carpeta de la factura no llega a la BD", async () => {
    const resultado = await registrarFacturaExpedida({
      ...entrada,
      archivoPath: `factura/${ANUNCIANTE}/0192f3a4-5b6c-7d8e-9f01-0000000000f1.pdf`,
    })
    expect(estado.rpc).toEqual([])
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: { archivo: [MENSAJES_FACTURACION.archivoAjeno] },
    })
  })

  it("un total distinto del borrador queda en el campo del total", async () => {
    estado.respuestas.registrar_factura_expedida_srv = {
      data: null,
      error: {
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El valor de la factura expedida no coincide con el del borrador.",
        hint: "total_distinto",
      },
    }
    const resultado = await registrarFacturaExpedida(entrada)
    expect(resultado).toMatchObject({
      ok: false,
      erroresCampo: {
        total: [
          "El valor de la factura expedida no coincide con el del borrador.",
        ],
      },
    })
  })
})

describe("registrarPagoFactura (LIQ-008 c2)", () => {
  const entrada = {
    facturaId: FACTURA,
    fecha: "2020-10-23",
    monto: "4.000.000",
    retenciones: "",
    medioPago: "PSE" as const,
    referencia: "CUS 123",
    soportePath: SOPORTE,
  }

  it("exige pagos.registrar, manda las retenciones (0 si van vacías) y devuelve el estado", async () => {
    estado.filas.facturas = { estado: "PAGADA_PARCIAL", saldo: 6_000_000 }
    const resultado = await registrarPagoFactura(entrada)
    expect(estado.orden[0]).toBe("dal:pagos.registrar")
    expect(estado.rpc[0]).toMatchObject({
      nombre: "registrar_pago_anunciante_srv",
      argumentos: {
        p_monto: 4_000_000,
        p_retenciones: 0,
        p_medio_pago: "PSE",
        p_referencia: "CUS 123",
        p_soporte_path: SOPORTE,
      },
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { estado: "PAGADA_PARCIAL", saldo: 6_000_000 },
    })
  })

  it("el soporte debe estar en la carpeta de pagos de la factura", async () => {
    const resultado = await registrarPagoFactura({
      ...entrada,
      soportePath: PDF,
    })
    expect(estado.rpc).toEqual([])
    expect(resultado.ok).toBe(false)
  })
})

describe("registrarNotaCredito (LIQ-008 c4)", () => {
  it("manda las asignaciones que libera y devuelve si la factura quedó anulada", async () => {
    estado.filas.facturas = { estado: "ANULADA", saldo: 0 }
    const resultado = await registrarNotaCredito({
      facturaId: FACTURA,
      numero: "nc125",
      cude: CUFE,
      fechaEmision: "2020-10-23",
      valor: "1.190.000",
      motivo: "La campaña se canceló por completo.",
      asignacionIds: ["0192f3a4-5b6c-7d8e-9f01-0000000000c1"],
      archivoPath: PDF,
    })
    expect(estado.orden[0]).toBe("dal:facturas.gestionar")
    expect(estado.rpc[0]).toMatchObject({
      nombre: "registrar_nota_credito_srv",
      argumentos: {
        p_numero: "NC125",
        p_valor: 1_190_000,
        p_asignacion_ids: ["0192f3a4-5b6c-7d8e-9f01-0000000000c1"],
        p_archivo_path: PDF,
      },
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { estado: "ANULADA", saldo: 0 },
    })
  })
})

describe("anularBorradorFactura", () => {
  it("anula un borrador por la máquina de estados con su motivo", async () => {
    estado.filas.facturas = { estado: "BORRADOR", saldo: 1_190_000 }
    const resultado = await anularBorradorFactura({
      facturaId: FACTURA,
      motivo: "Corte equivocado",
    })
    expect(estado.transiciones).toEqual([
      {
        entidad: "facturas",
        id: FACTURA,
        hacia: "ANULADA",
        motivo: "Corte equivocado",
      },
    ])
    expect(resultado.ok).toBe(true)
  })

  it("una expedida no se anula así: pide nota crédito", async () => {
    estado.filas.facturas = { estado: "EMITIDA", saldo: 1_190_000 }
    const resultado = await anularBorradorFactura({
      facturaId: FACTURA,
      motivo: "Corte equivocado",
    })
    expect(estado.transiciones).toEqual([])
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_FACTURACION.soloBorrador,
    })
  })
})

describe("generarArchivoCarga", () => {
  it("sin datos sensibles no revela la dirección, pero registra la exportación", async () => {
    const resultado = await generarArchivoCarga({ facturaId: FACTURA })
    expect(estado.rpc.map((llamada) => llamada.nombre)).toEqual([])
    expect(estado.eventos).toEqual([
      expect.objectContaining({
        accion: "EXPORTAR",
        entidad: "facturas",
        entidadId: FACTURA,
        metadatos: expect.objectContaining({ con_direccion: false }),
      }),
    ])
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.datos.sinDireccion).toBe(true)
    expect(resultado.datos.cuadra).toBe(true)
    expect(JSON.parse(resultado.datos.json).adquirente.direccion).toBeNull()
  })

  it("con datos sensibles revela solo la dirección (queda en la bitácora)", async () => {
    estado.permisos = [...estado.permisos, "datos_sensibles.ver"]
    estado.respuestas.revelar_privado_srv = {
      data: { direccion: " Cra. 27 # 18-30 " },
      error: null,
    }
    const resultado = await generarArchivoCarga({ facturaId: FACTURA })
    expect(estado.rpc[0]).toMatchObject({
      nombre: "revelar_privado_srv",
      argumentos: {
        p_tabla: "anunciantes_privado",
        p_id: ANUNCIANTE,
        p_campos: ["direccion"],
      },
    })
    if (!resultado.ok) throw new Error(resultado.error)
    expect(JSON.parse(resultado.datos.json).adquirente.direccion).toBe(
      "Cra. 27 # 18-30"
    )
  })

  it("no entrega nada si la exportación no quedó en la bitácora", async () => {
    estado.eventoRegistrado = false
    expect(await generarArchivoCarga({ facturaId: FACTURA })).toEqual({
      ok: false,
      error: MENSAJES_FACTURACION.sinRegistroExportacion,
    })
  })

  it("un borrador con una asignación en disputa pide anularlo", async () => {
    estado.lineas = [linea({ estado: "EN_DISPUTA" })]
    expect(await generarArchivoCarga({ facturaId: FACTURA })).toEqual({
      ok: false,
      error: MENSAJES_FACTURACION.borradorConLineasCaidas,
    })
    expect(estado.eventos).toEqual([])
  })
})

describe("firmarArchivoFactura", () => {
  it("firma el soporte de un pago como servicio con la ruta de su fila", async () => {
    estado.filas.pagos_anunciante = {
      soporte_path: SOPORTE,
      fecha_pago: "2026-10-20",
    }
    const resultado = await firmarArchivoFactura({
      tipo: "pago",
      facturaId: FACTURA,
      pagoId: PAGO,
    })
    expect(estado.orden[0]).toBe("dal:facturas.ver")
    expect(estado.firmas).toEqual([
      expect.objectContaining({
        bucket: "soportes",
        ruta: SOPORTE,
        firmante: expect.objectContaining({
          como: "servicio",
          entidad: "pagos_anunciante",
          entidadId: PAGO,
        }),
        descarga: "Soporte de pago 2026-10-20.png",
      }),
    ])
    expect(resultado.ok).toBe(true)
  })

  it("sin archivo en la fila no firma nada", async () => {
    estado.filas.facturas = { archivo_path: null, numero: null }
    expect(
      await firmarArchivoFactura({ tipo: "factura", facturaId: FACTURA })
    ).toEqual({ ok: false, error: MENSAJES_FACTURACION.sinArchivo })
    expect(estado.firmas).toEqual([])
  })
})
