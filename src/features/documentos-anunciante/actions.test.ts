// @vitest-environment node
/**
 * Server Actions de «Mi empresa › Documentos» con el DAL, Supabase y Storage
 * simulados: autorizan primero, toman la empresa de la sesión, construyen y
 * comprueban la ruta en el servidor y confirman de forma idempotente.
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
  error: { code?: string; message?: string } | null
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
  usuario: { id: "u1", anuncianteId: null as string | null },
  cliente: null as unknown,
}))

const simulados = vi.hoisted(() => ({
  refresh: vi.fn(),
  prepararSubidaFirmada: vi.fn(),
  confirmarObjeto: vi.fn(),
  firmarDescarga: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ refresh: simulados.refresh }))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return estado.usuario
  }),
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
  MENSAJES_DESCARGA: { noEncontrado: "no-encontrado" },
  firmarDescarga: simulados.firmarDescarga,
}))

const {
  confirmarDocumentoAnunciante,
  firmarDocumentoAnunciante,
  prepararSubidaDocumentoAnunciante,
} = await import("./actions")
const { SIN_EMPRESA } = await import("./errores")

const DESCRIPCION: DescripcionArchivo = {
  nombre: "rut.pdf",
  tipo: "application/pdf",
  tamano: 420_000,
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
  observaciones: null,
  fecha_vencimiento: null,
  created_at: "2026-10-22T13:00:00+00:00",
  validado_at: null,
  archivo_path: RUTA,
}

let supabase: ReturnType<typeof crearCliente>

beforeEach(() => {
  vi.clearAllMocks()
  estado.orden = []
  estado.usuario = { id: "u1", anuncianteId: EMPRESA }
  supabase = crearCliente()
  estado.cliente = supabase.cliente
})

describe("prepararSubidaDocumentoAnunciante", () => {
  it("autoriza antes que nada y firma una ruta construida en el servidor", async () => {
    simulados.prepararSubidaFirmada.mockResolvedValue(
      exito({ bucket: "documentos", ruta: "x", token: "t", miniatura: null })
    )
    const resultado = await prepararSubidaDocumentoAnunciante({
      tipo: "RUT",
      archivo: DESCRIPCION,
    })
    expect(resultado.ok).toBe(true)
    expect(estado.orden[0]).toBe("dal:anunciantes.editar_propio")
    const [opciones] = simulados.prepararSubidaFirmada.mock.calls[0]
    expect(opciones.cliente).toBe(supabase.cliente)
    expect(opciones.bucket).toBe("documentos")
    expect(opciones.ruta).toMatch(
      new RegExp(`^anunciante/${EMPRESA}/RUT/[0-9a-f-]{36}\\.pdf$`)
    )
  })

  it("rechaza lo que no pasa el esquema sin tocar Storage", async () => {
    const resultado = await prepararSubidaDocumentoAnunciante({
      tipo: "RUT",
      archivo: { ...DESCRIPCION, tipo: "video/mp4" },
    })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:anunciantes.editar_propio"])
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })

  it("una cuenta sin empresa no puede subir", async () => {
    estado.usuario = { id: "u1", anuncianteId: null }
    expect(
      await prepararSubidaDocumentoAnunciante({
        tipo: "RUT",
        archivo: DESCRIPCION,
      })
    ).toEqual(fallo(SIN_EMPRESA))
  })

  it("si el DAL corta (sin sesión o sin permiso), no se ejecuta nada más", async () => {
    const { requerirPermiso } = await import("@/lib/auth/dal")
    vi.mocked(requerirPermiso).mockRejectedValueOnce(
      new Error("NEXT_HTTP_ERROR_FALLBACK;403")
    )
    await expect(
      prepararSubidaDocumentoAnunciante({ tipo: "RUT", archivo: DESCRIPCION })
    ).rejects.toThrow()
    expect(estado.orden).toEqual([])
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })
})

describe("confirmarDocumentoAnunciante", () => {
  it("rechaza una ruta de otra empresa sin consultar ni escribir", async () => {
    const resultado = await confirmarDocumentoAnunciante({
      tipo: "RUT",
      archivo: { ...SUBIDO, ruta: RUTA.replace(EMPRESA, OTRA_EMPRESA) },
    })
    expect(resultado).toEqual(fallo("no-coincide"))
    expect(supabase.cliente.from).not.toHaveBeenCalled()
    expect(simulados.confirmarObjeto).not.toHaveBeenCalled()
  })

  it("rechaza una ruta de otro tipo de documento", async () => {
    expect(
      await confirmarDocumentoAnunciante({
        tipo: "CAMARA_COMERCIO",
        archivo: SUBIDO,
      })
    ).toEqual(fallo("no-coincide"))
  })

  it("verifica el objeto e inserta la fila con la sesión", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: FILA, error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarDocumentoAnunciante({
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado).toEqual(
      exito(
        expect.objectContaining({
          id: DOCUMENTO,
          estado: "PENDIENTE",
          formato: "application/pdf",
        })
      )
    )
    if (resultado.ok) expect(resultado.datos).not.toHaveProperty("archivo_path")
    expect(simulados.confirmarObjeto).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "documentos",
        ruta: RUTA,
        esperado: { tamano: SUBIDO.tamano, tipo: SUBIDO.tipo },
      })
    )
    expect(supabase.llamadas.inserciones).toEqual([
      { anunciante_id: EMPRESA, tipo: "RUT", archivo_path: RUTA },
    ])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("es idempotente por ruta: una confirmación repetida devuelve la misma fila", async () => {
    supabase.respuestas.push({ data: FILA, error: null })
    const resultado = await confirmarDocumentoAnunciante({
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
    const resultado = await confirmarDocumentoAnunciante({
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado.ok && resultado.datos.id).toBe(DOCUMENTO)
  })

  it("si el objeto no está o no coincide, no escribe la fila", async () => {
    supabase.respuestas.push({ data: null, error: null })
    simulados.confirmarObjeto.mockResolvedValue(fallo("no-subido"))
    expect(
      await confirmarDocumentoAnunciante({ tipo: "RUT", archivo: SUBIDO })
    ).toEqual(fallo("no-subido"))
    expect(supabase.llamadas.inserciones).toEqual([])
    expect(simulados.refresh).not.toHaveBeenCalled()
  })

  it("traduce el error de la BD y registra solo la operación y el código", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    supabase.respuestas.push(
      { data: null, error: null },
      {
        data: null,
        error: {
          code: "XX000",
          message: "algo interno con anunciante/ruta",
        },
      }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarDocumentoAnunciante({
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).not.toMatch(/interno/)
    expect(consola).toHaveBeenCalledWith(
      "[documentos-anunciante] registrar el documento falló (XX000)"
    )
    consola.mockRestore()
  })
})

describe("firmarDocumentoAnunciante", () => {
  it("firma como usuario la ruta de SU fila, filtrada por su empresa", async () => {
    supabase.respuestas.push(
      { data: FILA, error: null },
      { data: { pais_iso2: "CO" }, error: null }
    )
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://firmada", vigenciaSegundos: 300 })
    )
    const resultado = await firmarDocumentoAnunciante({
      documentoId: DOCUMENTO,
      descargar: true,
    })
    expect(resultado.ok).toBe(true)
    expect(supabase.llamadas.filtros).toEqual([
      ["id", DOCUMENTO],
      ["anunciante_id", EMPRESA],
      ["id", EMPRESA],
    ])
    expect(simulados.firmarDescarga).toHaveBeenCalledWith({
      bucket: "documentos",
      ruta: RUTA,
      firmante: { como: "usuario", cliente: supabase.cliente },
      descarga: "RUT.pdf",
    })
  })

  it("fuera de Colombia descarga la Cámara con su nombre equivalente", async () => {
    supabase.respuestas.push(
      {
        data: {
          ...FILA,
          tipo: "CAMARA_COMERCIO",
          archivo_path: RUTA.replace("RUT", "CAMARA_COMERCIO"),
        },
        error: null,
      },
      { data: { pais_iso2: "US" }, error: null }
    )
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://firmada", vigenciaSegundos: 300 })
    )
    await firmarDocumentoAnunciante({ documentoId: DOCUMENTO, descargar: true })
    expect(simulados.firmarDescarga).toHaveBeenCalledWith(
      expect.objectContaining({ descarga: "Certificado de existencia.pdf" })
    )
  })

  it("sin pedir descarga se firma para verlo en línea", async () => {
    supabase.respuestas.push(
      { data: FILA, error: null },
      { data: { pais_iso2: "CO" }, error: null }
    )
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://firmada", vigenciaSegundos: 300 })
    )
    await firmarDocumentoAnunciante({ documentoId: DOCUMENTO })
    expect(simulados.firmarDescarga).toHaveBeenCalledWith(
      expect.objectContaining({ descarga: undefined })
    )
  })

  it("lo que no es suyo, no existe o no es un uuid no se firma", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: { pais_iso2: "CO" }, error: null }
    )
    expect(await firmarDocumentoAnunciante({ documentoId: DOCUMENTO })).toEqual(
      fallo("no-encontrado")
    )
    expect(
      await firmarDocumentoAnunciante({ documentoId: "no-es-un-uuid" })
    ).toEqual(fallo("no-encontrado"))
    expect(simulados.firmarDescarga).not.toHaveBeenCalled()
  })
})
