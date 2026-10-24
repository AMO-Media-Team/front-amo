// @vitest-environment node
/**
 * Acciones de los pagos a medios con el DAL, las RPC, Storage y el descifrado
 * simulados: autorizan antes que nada, exigen «Ver datos sensibles» para el
 * archivo, mandan a la BD exactamente lo decidido, no dejan el CSV huérfano,
 * nunca devuelven datos bancarios y traducen los `hint` de la fase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { MENSAJES_PAGOS } from "./errores"

const LIQ_A = "0199f3a0-0000-7000-8000-00000000a501"
const LIQ_B = "0199f3a0-0000-7000-8000-00000000a502"
const DISPERSION = "0199f3a0-0000-7000-8000-0000000000d1"
const CUENTA = "03012345678"
const DOCUMENTO = "1085123456"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: ["liquidaciones.registrar_pago", "datos_sensibles.ver"] as string[],
  rpc: [] as { nombre: string; argumentos: Record<string, unknown> }[],
  respuestas: {} as Record<string, { data: unknown; error: unknown }>,
  /** Respuestas en orden para llamadas repetidas a la misma RPC. */
  colas: {} as Record<string, { data: unknown; error: unknown }[]>,
  revalidadas: [] as string[],
  subidas: [] as { ruta: string; contenido: unknown; tipo: string }[],
  resultadoSubida: null as unknown,
  retiradas: [] as string[][],
  firmas: [] as Record<string, unknown>[],
  resultadoFirma: null as unknown,
  descifrado: null as unknown,
  filaDispersion: null as unknown,
  preparadas: [] as Record<string, unknown>[],
  confirmados: [] as Record<string, unknown>[],
  resultadoConfirmar: null as unknown,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn((ruta: string, tipo?: string) => {
    estado.revalidadas.push(tipo ? `${ruta}:${tipo}` : ruta)
  }),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
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
          return (
            estado.colas[nombre]?.shift() ??
            estado.respuestas[nombre] ?? { data: null, error: null }
          )
        },
        storage: {
          from: () => ({
            remove: async (rutas: string[]) => {
              estado.retiradas.push(rutas)
              return { error: null }
            },
          }),
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
          maybeSingle: async () => ({
            data: estado.filaDispersion,
            error: null,
          }),
        }),
      }),
    }),
  })),
}))
vi.mock("@/lib/storage/subidas-servidor", () => ({
  subirComoServicio: vi.fn(
    async (opciones: {
      destino: { bucket: string; ruta: string }
      contenido: unknown
      tipo: string
    }) => {
      estado.subidas.push({
        ruta: opciones.destino.ruta,
        contenido: opciones.contenido,
        tipo: opciones.tipo,
      })
      return estado.resultadoSubida ?? exito(opciones.destino)
    }
  ),
}))
vi.mock("@/lib/storage/descargas", () => ({
  firmarDescarga: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.firmas.push(opciones)
    return (
      estado.resultadoFirma ??
      exito({ url: "https://storage.test/firmada", vigenciaSegundos: 300 })
    )
  }),
}))
vi.mock("@/lib/storage/subidas", () => ({
  MENSAJES_SUBIDA: {
    noPreparada: "No pudimos preparar la subida.",
    noVerificado: "No pudimos verificar el archivo.",
  },
  prepararSubidaFirmada: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.preparadas.push(opciones)
    return exito({
      bucket: "soportes",
      ruta: opciones.ruta,
      token: "t",
      miniatura: null,
    })
  }),
  confirmarObjeto: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.confirmados.push(opciones)
    return estado.resultadoConfirmar ?? exito({})
  }),
}))
vi.mock("./descifrado", () => ({
  descifrarPagos: vi.fn(() => estado.descifrado),
}))

const {
  confirmarSoportePago,
  descargarArchivoPagos,
  generarArchivoPagos,
  prepararSoportePago,
  registrarPagoLiquidacion,
} = await import("./actions")

const FILAS_CIFRADAS = [
  {
    liquidacion_id: LIQ_A,
    medio_id: "m1",
    medio: "Radio Pasto",
    monto_neto: 911_002,
  },
  {
    liquidacion_id: LIQ_B,
    medio_id: "m1",
    medio: "Radio Pasto",
    monto_neto: 100_000,
  },
]

const PAGOS = FILAS_CIFRADAS.map((fila) => ({
  liquidacionId: fila.liquidacion_id,
  medio: fila.medio,
  tipoDocumento: "CC",
  numeroDocumento: DOCUMENTO,
  titular: "Ana Gómez",
  cuenta: {
    metodo: "BANCARIO",
    banco: "Bancolombia",
    tipoCuenta: "AHORROS",
    numero: CUENTA,
  },
  montoNeto: fila.monto_neto,
}))

function errorBd(message: string, hint: string, details = "Detalle de la BD.") {
  return { code: "P0001", message, hint, details }
}

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.permisos = ["liquidaciones.registrar_pago", "datos_sensibles.ver"]
  estado.rpc = []
  estado.respuestas = {
    datos_dispersion_srv: { data: FILAS_CIFRADAS, error: null },
    registrar_dispersion_srv: { data: DISPERSION, error: null },
  }
  estado.colas = {}
  estado.revalidadas = []
  estado.subidas = []
  estado.resultadoSubida = null
  estado.retiradas = []
  estado.firmas = []
  estado.resultadoFirma = null
  estado.descifrado = { ok: true, pagos: PAGOS }
  estado.filaDispersion = null
  estado.preparadas = []
  estado.confirmados = []
  estado.resultadoConfirmar = null
})

describe("generarArchivoPagos (LIQ-005)", () => {
  const entrada = { liquidacionIds: [LIQ_A, LIQ_B] }

  it("autoriza, revela, arma el CSV en el servidor, lo registra y entrega solo la URL firmada", async () => {
    const resultado = await generarArchivoPagos(entrada)
    expect(estado.orden[0]).toBe("dal:liquidaciones.registrar_pago")

    expect(estado.rpc[0]).toEqual({
      nombre: "datos_dispersion_srv",
      argumentos: {
        p_liquidacion_ids: [LIQ_A, LIQ_B],
        p_actor_id: "u1",
        p_session_id: "s1",
        p_repetir: false,
      },
    })
    const [subida] = estado.subidas
    expect(subida.tipo).toBe("text/csv")
    expect(subida.ruta).toMatch(
      /^dispersion\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.csv$/
    )
    expect(String(subida.contenido)).toContain(CUENTA)
    expect(String(subida.contenido)).toContain(DOCUMENTO)

    const dispersionId = subida.ruta.split("/")[1]
    expect(estado.rpc[1]).toEqual({
      nombre: "registrar_dispersion_srv",
      argumentos: {
        p_dispersion_id: dispersionId,
        p_liquidacion_ids: [LIQ_A, LIQ_B],
        p_archivo_path: subida.ruta,
        p_actor_id: "u1",
        p_session_id: "s1",
        p_repetir: false,
      },
    })
    expect(estado.firmas[0]).toMatchObject({
      bucket: "soportes",
      ruta: subida.ruta,
      firmante: {
        como: "servicio",
        entidad: "dispersiones",
        entidadId: dispersionId,
      },
      descarga: expect.stringMatching(/^archivo-pagos-\d{4}-\d{2}-\d{2}\.csv$/),
    })
    expect(estado.revalidadas).toEqual([
      "/finanzas/pagos:layout",
      "/finanzas/liquidaciones:layout",
    ])
    expect(estado.retiradas).toEqual([])
    expect(resultado).toEqual(
      exito({
        tipo: "generado",
        dispersionId,
        cantidad: 2,
        medios: 1,
        total: 1_011_002,
        nombreArchivo: expect.stringMatching(/^archivo-pagos-/),
        url: "https://storage.test/firmada",
        avisoDescarga: null,
      })
    )
    // Nada de lo descifrado sale en la respuesta.
    expect(JSON.stringify(resultado)).not.toContain(CUENTA)
    expect(JSON.stringify(resultado)).not.toContain(DOCUMENTO)
  })

  it("sin «Ver datos sensibles» lo explica sin llamar a la BD", async () => {
    estado.permisos = ["liquidaciones.registrar_pago"]
    expect(await generarArchivoPagos(entrada)).toEqual(
      fallo(MENSAJES_PAGOS.sinDatosSensibles)
    )
    expect(estado.rpc).toEqual([])
  })

  it("valida la entrada antes de llamar a la BD", async () => {
    const resultado = await generarArchivoPagos({ liquidacionIds: [] })
    expect(resultado.ok).toBe(false)
    expect(estado.rpc).toEqual([])
  })

  it("si alguna ya estaba en otro archivo, pide confirmar y repite con `p_repetir`", async () => {
    estado.respuestas.datos_dispersion_srv = {
      data: null,
      error: errorBd(
        "AMO_TRANSICION_INVALIDA",
        "ya_dispersada",
        "Alguna liquidación ya está en un archivo de pagos: confirma que el banco no la pagó antes de incluirla otra vez."
      ),
    }
    expect(await generarArchivoPagos(entrada)).toEqual(
      exito({
        tipo: "ya_dispersada",
        mensaje:
          "Alguna liquidación ya está en un archivo de pagos: confirma que el banco no la pagó antes de incluirla otra vez.",
      })
    )
    expect(estado.subidas).toEqual([])

    estado.respuestas.datos_dispersion_srv = {
      data: FILAS_CIFRADAS,
      error: null,
    }
    await generarArchivoPagos({ ...entrada, repetir: true })
    expect(estado.rpc.at(-2)?.argumentos.p_repetir).toBe(true)
    expect(estado.rpc.at(-1)?.argumentos.p_repetir).toBe(true)
  })

  it("si un medio no se puede descifrar, no sube nada y lo nombra", async () => {
    estado.descifrado = { ok: false, medios: ["Radio Pasto"] }
    const resultado = await generarArchivoPagos(entrada)
    expect(resultado.ok).toBe(false)
    expect(!resultado.ok && resultado.error).toMatch(
      /^No pudimos leer los datos de pago de Radio Pasto/
    )
    expect(estado.subidas).toEqual([])
  })

  it("los datos de pago incompletos llegan con el detalle de la BD", async () => {
    estado.respuestas.datos_dispersion_srv = {
      data: null,
      error: errorBd(
        "AMO_TRANSICION_INVALIDA",
        "datos_pago_incompletos",
        "Estos medios no tienen datos de pago completos con su certificación aprobada: Radio Pasto."
      ),
    }
    expect(await generarArchivoPagos(entrada)).toEqual(
      fallo(
        "Estos medios no tienen datos de pago completos con su certificación aprobada: Radio Pasto."
      )
    )
  })

  it("si no se pudo registrar, retira el CSV (lleva datos bancarios)", async () => {
    estado.respuestas.registrar_dispersion_srv = {
      data: null,
      error: errorBd("AMO_TRANSICION_INVALIDA", "no_aprobada"),
    }
    const resultado = await generarArchivoPagos(entrada)
    expect(resultado).toEqual(fallo(MENSAJES_PAGOS.noAprobada))
    expect(estado.retiradas).toEqual([[estado.subidas[0].ruta]])
    expect(estado.firmas).toEqual([])
  })

  it("si se perdió la respuesta del registro, no retira el CSV: pudo quedar registrado", async () => {
    // postgrest-js no lanza ante un fallo de red: devuelve un error sin código.
    estado.respuestas.registrar_dispersion_srv = {
      data: null,
      error: { code: "", message: "FetchError: socket hang up", details: "" },
    }
    const resultado = await generarArchivoPagos(entrada)
    expect(resultado).toEqual(fallo(MENSAJES_PAGOS.respuestaPerdida))
    expect(estado.retiradas).toEqual([])
    expect(estado.firmas).toEqual([])
    // Se refresca para que «Archivos de pagos» muestre lo que haya quedado.
    expect(estado.revalidadas).toContain("/finanzas/pagos:layout")
  })

  it("si falla la subida, no registra", async () => {
    estado.resultadoSubida = fallo("No pudimos guardar el archivo.")
    expect(await generarArchivoPagos(entrada)).toEqual(
      fallo("No pudimos guardar el archivo.")
    )
    expect(estado.rpc.map((llamada) => llamada.nombre)).toEqual([
      "datos_dispersion_srv",
    ])
  })

  it("si no se pudo firmar la descarga, el archivo queda registrado y se avisa", async () => {
    estado.resultadoFirma = fallo("No pudimos registrar el acceso al archivo.")
    const resultado = await generarArchivoPagos(entrada)
    expect(resultado).toMatchObject({
      ok: true,
      datos: {
        tipo: "generado",
        url: null,
        avisoDescarga: "No pudimos registrar el acceso al archivo.",
      },
    })
    expect(estado.retiradas).toEqual([])
  })
})

describe("descargarArchivoPagos", () => {
  it("firma como servicio la ruta de la fila leída con la sesión", async () => {
    estado.filaDispersion = {
      archivo_path: `dispersion/${DISPERSION}/pagos.csv`,
      created_at: "2026-10-18T17:14:34Z",
    }
    const resultado = await descargarArchivoPagos({ dispersionId: DISPERSION })
    expect(estado.orden[0]).toBe("dal:liquidaciones.registrar_pago")
    expect(estado.firmas[0]).toMatchObject({
      bucket: "soportes",
      ruta: `dispersion/${DISPERSION}/pagos.csv`,
      firmante: {
        como: "servicio",
        entidad: "dispersiones",
        entidadId: DISPERSION,
      },
      descarga: "archivo-pagos-2026-10-18.csv",
    })
    expect(resultado.ok).toBe(true)
  })

  it("sin la fila (o sin acceso) lo dice; sin datos sensibles no firma", async () => {
    expect(await descargarArchivoPagos({ dispersionId: DISPERSION })).toEqual(
      fallo(MENSAJES_PAGOS.sinArchivo)
    )
    estado.permisos = ["liquidaciones.registrar_pago"]
    expect(await descargarArchivoPagos({ dispersionId: DISPERSION })).toEqual(
      fallo(MENSAJES_PAGOS.sinDatosSensibles)
    )
    expect(estado.firmas).toEqual([])
  })
})

describe("soporte del pago", () => {
  const descripcion = {
    nombre: "comprobante.pdf",
    tipo: "application/pdf",
    tamano: 2048,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: false,
  }

  it("prepara la subida en la carpeta de pago de la liquidación", async () => {
    await prepararSoportePago({ liquidacionId: LIQ_A, descripcion })
    expect(estado.orden[0]).toBe("dal:liquidaciones.registrar_pago")
    expect(estado.preparadas[0]?.ruta).toMatch(
      new RegExp(`^liquidacion/${LIQ_A}/pago/[0-9a-f-]{36}\\.pdf$`)
    )
  })

  it("no admite formatos que el bucket rechaza", async () => {
    const resultado = await prepararSoportePago({
      liquidacionId: LIQ_A,
      descripcion: { ...descripcion, tipo: "image/webp", nombre: "x.webp" },
    })
    expect(resultado.ok).toBe(false)
    expect(estado.preparadas).toEqual([])
  })

  it("confirma como servicio solo un archivo de esa carpeta", async () => {
    const ruta = `liquidacion/${LIQ_A}/pago/0199f3a0-0000-7000-8000-0000000000f1.pdf`
    const archivo = {
      ...descripcion,
      bucket: "soportes" as const,
      ruta,
      rutaMiniatura: null,
    }
    expect(
      await confirmarSoportePago({ liquidacionId: LIQ_A, archivo })
    ).toEqual(exito({ ruta }))
    expect(estado.confirmados[0]).toMatchObject({
      bucket: "soportes",
      ruta,
      esperado: { tamano: 2048, tipo: "application/pdf" },
    })

    expect(
      await confirmarSoportePago({ liquidacionId: LIQ_B, archivo })
    ).toEqual(fallo(MENSAJES_PAGOS.soporteAjeno))
  })
})

describe("registrarPagoLiquidacion (LIQ-006)", () => {
  const soportePath = `liquidacion/${LIQ_A}/pago/0199f3a0-0000-7000-8000-0000000000f1.pdf`
  const entrada = {
    liquidacionId: LIQ_A,
    fecha: "2026-10-20",
    referencia: " TRF-20261020-1 ",
    soportePath,
  }

  it("registra con fecha, referencia y soporte y revalida", async () => {
    expect(await registrarPagoLiquidacion(entrada)).toEqual(
      exito({ liquidacionId: LIQ_A })
    )
    expect(estado.orden[0]).toBe("dal:liquidaciones.registrar_pago")
    expect(estado.rpc[0]).toEqual({
      nombre: "registrar_pago_liquidacion_srv",
      argumentos: {
        p_liquidacion_id: LIQ_A,
        p_fecha: "2026-10-20",
        p_referencia: "TRF-20261020-1",
        p_soporte_path: soportePath,
        p_actor_id: "u1",
        p_session_id: "s1",
      },
    })
    expect(estado.revalidadas).toContain("/finanzas/pagos:layout")
  })

  it("rechaza un soporte de otra liquidación sin llamar a la BD", async () => {
    const resultado = await registrarPagoLiquidacion({
      ...entrada,
      soportePath: `liquidacion/${LIQ_B}/pago/0199f3a0-0000-7000-8000-0000000000f1.pdf`,
    })
    expect(resultado).toEqual(
      fallo(MENSAJES_PAGOS.soporteAjeno, {
        soporte: [MENSAJES_PAGOS.soporteAjeno],
      })
    )
    expect(estado.rpc).toEqual([])
  })

  it("lleva cada error de la BD a su campo", async () => {
    estado.respuestas.registrar_pago_liquidacion_srv = {
      data: null,
      error: errorBd(
        "AMO_TRANSICION_INVALIDA",
        "fecha_pago",
        "La fecha del pago va entre la generación de la liquidación y hoy."
      ),
    }
    expect(await registrarPagoLiquidacion(entrada)).toEqual(
      fallo(
        "La fecha del pago va entre la generación de la liquidación y hoy.",
        {
          fecha: [
            "La fecha del pago va entre la generación de la liquidación y hoy.",
          ],
        }
      )
    )
    estado.respuestas.registrar_pago_liquidacion_srv = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_DOCUMENTO_SOPORTE_REQUERIDO",
        details: "Emite el documento soporte antes de registrar el pago.",
      },
    }
    expect(await registrarPagoLiquidacion(entrada)).toEqual(
      fallo(
        "Documento soporte requerido: emite el documento soporte antes de registrar el pago."
      )
    )
  })

  it("si ya no está aprobada, refresca para mostrar lo vigente", async () => {
    estado.respuestas.registrar_pago_liquidacion_srv = {
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: null,
      },
    }
    const resultado = await registrarPagoLiquidacion(entrada)
    expect(resultado.ok).toBe(false)
    expect(estado.revalidadas).toContain("/finanzas/liquidaciones:layout")
  })
})
