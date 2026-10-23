// @vitest-environment node
/**
 * Server Actions de la verificación de anunciantes con el DAL, Supabase,
 * Storage y `transicionar` simulados: autorizan primero, validan con el mismo
 * esquema, cambian estados solo por la transición con actor y sesión, firman
 * y confirman como servicio tras leer con la sesión, y la carga interna es
 * idempotente por ruta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ArchivoSubido, DescripcionArchivo } from "@/lib/archivos/tipos"
import { exito, fallo } from "@/lib/result"

const EMPRESA = "0192f1c2-5b6a-7d00-8000-000000000001"
const OTRA_EMPRESA = "0192f1c2-5b6a-7d00-8000-000000000002"
const DOCUMENTO = "0192f1c2-5b6a-7d00-8000-0000000000aa"
const RUTA = `anunciante/${EMPRESA}/RUT/0192f1c2-5b6a-7d00-8000-0000000000bb.pdf`

interface Respuesta {
  data: unknown
  error: { code?: string; message?: string; details?: string } | null
}

/** Consulta encadenable de PostgREST: registra los filtros y responde en orden. */
function crearCliente() {
  const respuestas: Respuesta[] = []
  const llamadas = {
    tablas: [] as string[],
    filtros: [] as [string, unknown][],
    inserciones: [] as unknown[],
  }
  const consulta = {
    select: vi.fn(() => consulta),
    eq: vi.fn((columna: string, valor: unknown) => {
      llamadas.filtros.push([columna, valor])
      return consulta
    }),
    insert: vi.fn((fila: unknown) => {
      llamadas.inserciones.push(fila)
      return consulta
    }),
    maybeSingle: vi.fn(async () => respuestas.shift()),
    single: vi.fn(async () => respuestas.shift()),
  }
  const cliente = {
    from: vi.fn((tabla: string) => {
      llamadas.tablas.push(tabla)
      return consulta
    }),
  }
  return { cliente, respuestas, llamadas }
}

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: [] as string[],
  cliente: null as unknown,
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  transicionar: vi.fn(),
  prepararSubidaFirmada: vi.fn(),
  confirmarObjeto: vi.fn(),
  firmarDescarga: vi.fn(),
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
  transicionar: simulados.transicionar,
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => {
    estado.orden.push("cliente")
    return estado.cliente
  }),
}))
vi.mock("@/lib/storage/subidas", () => ({
  MENSAJES_SUBIDA: { noCoincide: "no-coincide" },
  prepararSubidaFirmada: simulados.prepararSubidaFirmada,
  confirmarObjeto: simulados.confirmarObjeto,
}))
vi.mock("@/lib/storage/descargas", () => ({
  firmarDescarga: simulados.firmarDescarga,
}))

const {
  aprobarDocumentoAnunciante,
  confirmarCargaDocumentoAnunciante,
  firmarDocumentoAnunciante,
  prepararCargaDocumentoAnunciante,
  reactivarAnunciante,
  rechazarAnunciante,
  rechazarDocumentoAnunciante,
  suspenderAnunciante,
  verificarAnunciante,
} = await import("./actions")
const { MENSAJES_VERIFICACION_ANUNCIANTE } = await import("./errores")

const DESCRIPCION: DescripcionArchivo = {
  nombre: "rut.pdf",
  tipo: "application/pdf",
  tamano: 120_000,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: false,
}

const SUBIDO: ArchivoSubido = {
  ...DESCRIPCION,
  bucket: "documentos",
  ruta: RUTA,
  rutaMiniatura: null,
}

const FILA = {
  id: DOCUMENTO,
  tipo: "RUT",
  estado_validacion: "PENDIENTE",
  fecha_vencimiento: null,
  observaciones: null,
  validado_at: null,
  created_at: "2026-10-22T13:00:00+00:00",
  archivo_path: RUTA,
}

const VERIFICADOR = ["anunciantes.ver", "anunciantes.verificar"]

let supabase: ReturnType<typeof crearCliente>

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.permisos = [...VERIFICADOR, "anunciantes.editar"]
  supabase = crearCliente()
  estado.cliente = supabase.cliente
  simulados.transicionar.mockResolvedValue({ data: {}, error: null })
})

describe("documentos", () => {
  it("aprobar autoriza primero y envía la vigencia y las observaciones", async () => {
    const resultado = await aprobarDocumentoAnunciante({
      documentoId: DOCUMENTO,
      fechaVencimiento: "2099-12-31",
      observaciones: " Expedido este mes ",
    })
    expect(resultado).toEqual(exito())
    expect(estado.orden[0]).toBe("dal:anunciantes.verificar")
    expect(simulados.transicionar).toHaveBeenCalledWith(
      { actorId: "actor-1", sessionId: "sesion-1", admin: simulados.admin },
      {
        entidad: "documentos_anunciante",
        id: DOCUMENTO,
        hacia: "APROBADO",
        datos: {
          fecha_vencimiento: "2099-12-31",
          observaciones: "Expedido este mes",
        },
      }
    )
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("sin vigencia ni observaciones no envía datos", async () => {
    await aprobarDocumentoAnunciante({ documentoId: DOCUMENTO })
    expect(simulados.transicionar.mock.calls[0][1].datos).toEqual({})
  })

  it("una vigencia pasada se marca en su campo sin llamar a la BD", async () => {
    const resultado = await aprobarDocumentoAnunciante({
      documentoId: DOCUMENTO,
      fechaVencimiento: "2000-01-01",
    })
    const mensaje = MENSAJES_VERIFICACION_ANUNCIANTE.vigenciaPasada
    expect(resultado).toEqual(fallo(mensaje, { fechaVencimiento: [mensaje] }))
    expect(simulados.transicionar).not.toHaveBeenCalled()
  })

  it("rechazar exige motivo (campo) y lo envía a la transición", async () => {
    const corto = await rechazarDocumentoAnunciante({
      documentoId: DOCUMENTO,
      motivo: "no",
    })
    expect(corto.ok).toBe(false)
    expect(!corto.ok && corto.erroresCampo?.motivo).toBeTruthy()
    expect(simulados.transicionar).not.toHaveBeenCalled()

    await rechazarDocumentoAnunciante({
      documentoId: DOCUMENTO,
      motivo: "RUT ilegible",
    })
    expect(simulados.transicionar.mock.calls[0][1]).toEqual({
      entidad: "documentos_anunciante",
      id: DOCUMENTO,
      hacia: "RECHAZADO",
      motivo: "RUT ilegible",
    })
  })

  it("firmar lee la ruta con la sesión y firma como servicio (bitácora)", async () => {
    supabase.respuestas.push({ data: { archivo_path: RUTA }, error: null })
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://x", vigenciaSegundos: 300 })
    )
    const resultado = await firmarDocumentoAnunciante({
      documentoId: DOCUMENTO,
    })
    expect(resultado.ok).toBe(true)
    expect(estado.orden).toEqual(["dal:anunciantes.verificar", "cliente"])
    expect(supabase.llamadas.filtros).toEqual([["id", DOCUMENTO]])
    expect(simulados.firmarDescarga).toHaveBeenCalledWith({
      bucket: "documentos",
      ruta: RUTA,
      firmante: {
        como: "servicio",
        contexto: expect.objectContaining({ actorId: "actor-1" }),
        entidad: "documentos_anunciante",
        entidadId: DOCUMENTO,
      },
    })
  })

  it("un documento que la sesión no ve no se firma", async () => {
    supabase.respuestas.push({ data: null, error: null })
    expect(await firmarDocumentoAnunciante({ documentoId: DOCUMENTO })).toEqual(
      fallo(MENSAJES_VERIFICACION_ANUNCIANTE.documentoNoEncontrado)
    )
    expect(simulados.firmarDescarga).not.toHaveBeenCalled()
  })
})

describe("decisión sobre la empresa", () => {
  it("verificar devuelve el detalle de la BD (qué falta) sin refrescar", async () => {
    simulados.transicionar.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio.",
      },
    })
    const resultado = await verificarAnunciante({ anuncianteId: EMPRESA })
    expect(resultado).toEqual(
      fallo("Faltan documentos aprobados y vigentes: RUT, Cámara de Comercio.")
    )
    expect(simulados.transicionar.mock.calls[0][1]).toEqual({
      entidad: "anunciantes",
      id: EMPRESA,
      hacia: "VERIFICADO",
    })
    expect(simulados.refresh).not.toHaveBeenCalled()
  })

  it("rechazar la empresa lleva el motivo", async () => {
    await rechazarAnunciante({
      anuncianteId: EMPRESA,
      motivo: "El NIT no coincide con el RUT",
    })
    expect(estado.orden[0]).toBe("dal:anunciantes.verificar")
    expect(simulados.transicionar.mock.calls[0][1]).toMatchObject({
      hacia: "RECHAZADO",
      motivo: "El NIT no coincide con el RUT",
    })
  })

  it("suspender y reactivar exigen `anunciantes.suspender` y un motivo", async () => {
    await suspenderAnunciante({
      anuncianteId: EMPRESA,
      motivo: "Facturas vencidas",
    })
    await reactivarAnunciante({
      anuncianteId: EMPRESA,
      motivo: "Pagó las facturas",
    })
    expect(estado.orden.filter((paso) => paso.startsWith("dal:"))).toEqual([
      "dal:anunciantes.suspender",
      "dal:anunciantes.suspender",
    ])
    expect(
      simulados.transicionar.mock.calls.map(([, solicitud]) => solicitud.hacia)
    ).toEqual(["SUSPENDIDO", "VERIFICADO"])
    expect(simulados.refresh).toHaveBeenCalledTimes(2)
  })

  it("un motivo demasiado largo en la BD se marca en su campo", async () => {
    simulados.transicionar.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message:
          'new row for relation "anunciantes" violates check constraint "anunciantes_motivo_estado_chk"',
      },
    })
    const resultado = await suspenderAnunciante({
      anuncianteId: EMPRESA,
      motivo: "Motivo válido",
    })
    expect(!resultado.ok && resultado.erroresCampo?.motivo).toEqual([
      "El motivo admite hasta 500 caracteres.",
    ])
  })

  it("si el DAL corta, no se ejecuta nada más", async () => {
    const { requerirPermiso } = await import("@/lib/auth/dal")
    vi.mocked(requerirPermiso).mockRejectedValueOnce(
      new Error("NEXT_HTTP_ERROR_FALLBACK;403")
    )
    await expect(
      verificarAnunciante({ anuncianteId: EMPRESA })
    ).rejects.toThrow()
    expect(simulados.transicionar).not.toHaveBeenCalled()
  })
})

describe("carga por cuenta de la empresa", () => {
  it("prepara una ruta construida en el servidor, firmada con la sesión", async () => {
    simulados.prepararSubidaFirmada.mockResolvedValue(
      exito({ bucket: "documentos", ruta: "x", token: "t", miniatura: null })
    )
    const resultado = await prepararCargaDocumentoAnunciante({
      anuncianteId: EMPRESA,
      tipo: "RUT",
      archivo: DESCRIPCION,
    })
    expect(resultado.ok).toBe(true)
    expect(estado.orden[0]).toBe("dal:anunciantes.editar")
    const [opciones] = simulados.prepararSubidaFirmada.mock.calls[0]
    expect(opciones.cliente).toBe(supabase.cliente)
    expect(opciones.ruta).toMatch(
      new RegExp(`^anunciante/${EMPRESA}/RUT/[0-9a-f-]{36}\\.pdf$`)
    )
  })

  it("sin permiso de verificar no carga (no podría leer lo que sube)", async () => {
    estado.permisos = ["anunciantes.ver", "anunciantes.editar"]
    expect(
      await prepararCargaDocumentoAnunciante({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: DESCRIPCION,
      })
    ).toEqual(fallo(MENSAJES_VERIFICACION_ANUNCIANTE.sinPermisoCarga))
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })

  it("un formato que no admite el bucket se rechaza sin tocar Storage", async () => {
    const resultado = await prepararCargaDocumentoAnunciante({
      anuncianteId: EMPRESA,
      tipo: "RUT",
      archivo: { ...DESCRIPCION, tipo: "video/mp4" },
    })
    expect(resultado.ok).toBe(false)
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })

  it("rechaza una ruta de otra empresa o de otro tipo sin consultar", async () => {
    expect(
      await confirmarCargaDocumentoAnunciante({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: { ...SUBIDO, ruta: RUTA.replace(EMPRESA, OTRA_EMPRESA) },
      })
    ).toEqual(fallo("no-coincide"))
    expect(
      await confirmarCargaDocumentoAnunciante({
        anuncianteId: EMPRESA,
        tipo: "CAMARA_COMERCIO",
        archivo: SUBIDO,
      })
    ).toEqual(fallo("no-coincide"))
    expect(supabase.cliente.from).not.toHaveBeenCalled()
  })

  it("confirma el objeto como servicio e inserta la fila con la sesión", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: FILA, error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarCargaDocumentoAnunciante({
      anuncianteId: EMPRESA,
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado).toEqual(
      exito(
        expect.objectContaining({
          id: DOCUMENTO,
          estado: "PENDIENTE",
          mime: "application/pdf",
        })
      )
    )
    if (resultado.ok) expect(resultado.datos).not.toHaveProperty("archivo_path")
    expect(simulados.confirmarObjeto).toHaveBeenCalledWith({
      cliente: simulados.admin,
      bucket: "documentos",
      ruta: RUTA,
      esperado: { tamano: SUBIDO.tamano, tipo: SUBIDO.tipo },
    })
    expect(supabase.llamadas.inserciones).toEqual([
      { anunciante_id: EMPRESA, tipo: "RUT", archivo_path: RUTA },
    ])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("es idempotente por ruta: repetir devuelve la misma fila", async () => {
    supabase.respuestas.push({ data: FILA, error: null })
    const resultado = await confirmarCargaDocumentoAnunciante({
      anuncianteId: EMPRESA,
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado.ok && resultado.datos.id).toBe(DOCUMENTO)
    expect(supabase.llamadas.filtros).toEqual([
      ["anunciante_id", EMPRESA],
      ["archivo_path", RUTA],
    ])
    expect(simulados.confirmarObjeto).not.toHaveBeenCalled()
    expect(supabase.llamadas.inserciones).toEqual([])
  })

  it("si otra confirmación gana la carrera (23505), devuelve la fila que quedó", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      {
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "documentos_anunciante_archivo_path_key"',
        },
      },
      { data: FILA, error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarCargaDocumentoAnunciante({
      anuncianteId: EMPRESA,
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado.ok && resultado.datos.id).toBe(DOCUMENTO)
  })

  it("si el objeto no está en Storage no se registra nada", async () => {
    supabase.respuestas.push({ data: null, error: null })
    simulados.confirmarObjeto.mockResolvedValue(fallo("no-subido"))
    expect(
      await confirmarCargaDocumentoAnunciante({
        anuncianteId: EMPRESA,
        tipo: "RUT",
        archivo: SUBIDO,
      })
    ).toEqual(fallo("no-subido"))
    expect(supabase.llamadas.inserciones).toEqual([])
  })
})
