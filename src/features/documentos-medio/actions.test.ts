// @vitest-environment node
/**
 * Server Actions de «Mis documentos» con el DAL, Supabase y Storage
 * simulados: autorizan primero, toman el medio de la sesión, construyen y
 * comprueban la ruta en el servidor y confirman de forma idempotente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ArchivoSubido, DescripcionArchivo } from "@/lib/archivos/tipos"
import { exito, fallo } from "@/lib/result"

const MEDIO = "0192f1c2-5b6a-7d00-8000-000000000001"
const OTRO_MEDIO = "0192f1c2-5b6a-7d00-8000-000000000002"
const DOCUMENTO = "0192f1c2-5b6a-7d00-8000-0000000000aa"
const RUTA = `medio/${MEDIO}/CEDULA_FRENTE/0192f1c2-5b6a-7d00-8000-0000000000bb.webp`

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
  usuario: { id: "u1", medioId: null as string | null },
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

const { confirmarDocumento, firmarDocumento, prepararSubidaDocumento } =
  await import("./actions")
const { SIN_MEDIO } = await import("./errores")

const DESCRIPCION: DescripcionArchivo = {
  nombre: "cedula.webp",
  tipo: "image/webp",
  tamano: 850_000,
  sha256: null,
  dimensiones: { ancho: 1600, alto: 1000 },
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
  tipo: "CEDULA_FRENTE",
  estado_validacion: "PENDIENTE",
  metodo: "ARCHIVO",
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
  estado.usuario = { id: "u1", medioId: MEDIO }
  supabase = crearCliente()
  estado.cliente = supabase.cliente
})

describe("prepararSubidaDocumento", () => {
  it("autoriza antes que nada y firma una ruta construida en el servidor", async () => {
    simulados.prepararSubidaFirmada.mockResolvedValue(
      exito({ bucket: "documentos", ruta: "x", token: "t", miniatura: null })
    )
    const resultado = await prepararSubidaDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: DESCRIPCION,
    })
    expect(resultado.ok).toBe(true)
    expect(estado.orden[0]).toBe("dal:medios.editar_propio")
    const [opciones] = simulados.prepararSubidaFirmada.mock.calls[0]
    expect(opciones.cliente).toBe(supabase.cliente)
    expect(opciones.bucket).toBe("documentos")
    expect(opciones.ruta).toMatch(
      new RegExp(`^medio/${MEDIO}/CEDULA_FRENTE/[0-9a-f-]{36}\\.webp$`)
    )
  })

  it("rechaza lo que no pasa el esquema sin tocar Storage", async () => {
    const resultado = await prepararSubidaDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: { ...DESCRIPCION, tipo: "video/mp4" },
    })
    expect(resultado.ok).toBe(false)
    expect(estado.orden).toEqual(["dal:medios.editar_propio"])
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })

  it("una cuenta sin medio no puede subir", async () => {
    estado.usuario = { id: "u1", medioId: null }
    expect(
      await prepararSubidaDocumento({
        tipo: "CEDULA_FRENTE",
        archivo: DESCRIPCION,
      })
    ).toEqual(fallo(SIN_MEDIO))
  })

  it("si el DAL corta (sin sesión o sin permiso), no se ejecuta nada más", async () => {
    const { requerirPermiso } = await import("@/lib/auth/dal")
    vi.mocked(requerirPermiso).mockRejectedValueOnce(
      new Error("NEXT_HTTP_ERROR_FALLBACK;403")
    )
    await expect(
      prepararSubidaDocumento({ tipo: "RUT", archivo: DESCRIPCION })
    ).rejects.toThrow()
    expect(estado.orden).toEqual([])
    expect(simulados.prepararSubidaFirmada).not.toHaveBeenCalled()
  })
})

describe("confirmarDocumento", () => {
  it("rechaza una ruta de otro medio sin consultar ni escribir", async () => {
    const resultado = await confirmarDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: { ...SUBIDO, ruta: RUTA.replace(MEDIO, OTRO_MEDIO) },
    })
    expect(resultado).toEqual(fallo("no-coincide"))
    expect(supabase.cliente.from).not.toHaveBeenCalled()
    expect(simulados.confirmarObjeto).not.toHaveBeenCalled()
  })

  it("rechaza una ruta de otro tipo de documento", async () => {
    const resultado = await confirmarDocumento({
      tipo: "RUT",
      archivo: SUBIDO,
    })
    expect(resultado).toEqual(fallo("no-coincide"))
  })

  it("verifica el objeto e inserta la fila con la sesión", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      { data: FILA, error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: SUBIDO,
    })
    expect(resultado).toEqual(
      exito(
        expect.objectContaining({
          id: DOCUMENTO,
          estado: "PENDIENTE",
          formato: "image/webp",
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
      { medio_id: MEDIO, tipo: "CEDULA_FRENTE", archivo_path: RUTA },
    ])
    expect(simulados.refresh).toHaveBeenCalledTimes(1)
  })

  it("es idempotente por ruta: una confirmación repetida devuelve la misma fila", async () => {
    supabase.respuestas.push({ data: FILA, error: null })
    const resultado = await confirmarDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: SUBIDO,
    })
    expect(resultado.ok && resultado.datos.id).toBe(DOCUMENTO)
    expect(supabase.llamadas.filtros).toEqual([
      ["medio_id", MEDIO],
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
            'duplicate key value violates unique constraint "documentos_medio_archivo_path_key"',
        },
      },
      { data: FILA, error: null }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: SUBIDO,
    })
    expect(resultado.ok && resultado.datos.id).toBe(DOCUMENTO)
  })

  it("si el objeto no está o no coincide, no escribe la fila", async () => {
    supabase.respuestas.push({ data: null, error: null })
    simulados.confirmarObjeto.mockResolvedValue(fallo("no-subido"))
    expect(
      await confirmarDocumento({ tipo: "CEDULA_FRENTE", archivo: SUBIDO })
    ).toEqual(fallo("no-subido"))
    expect(supabase.llamadas.inserciones).toEqual([])
    expect(simulados.refresh).not.toHaveBeenCalled()
  })

  it("traduce el error de la BD sin mostrar el mensaje técnico", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    supabase.respuestas.push(
      { data: null, error: null },
      {
        data: null,
        error: {
          code: "42501",
          message:
            'new row violates row-level security policy for table "documentos_medio"',
        },
      }
    )
    simulados.confirmarObjeto.mockResolvedValue(exito({}))
    const resultado = await confirmarDocumento({
      tipo: "CEDULA_FRENTE",
      archivo: SUBIDO,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).not.toMatch(/row-level/)
    // El log del servidor lleva la operación y el código, nunca la ruta.
    expect(consola).toHaveBeenCalledWith(
      "[documentos-medio] registrar el documento falló (42501)"
    )
    consola.mockRestore()
  })
})

describe("firmarDocumento", () => {
  it("firma como usuario la ruta de SU fila, filtrada por su medio", async () => {
    supabase.respuestas.push({ data: FILA, error: null })
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://firmada", vigenciaSegundos: 300 })
    )
    const resultado = await firmarDocumento({
      documentoId: DOCUMENTO,
      descargar: true,
    })
    expect(resultado.ok).toBe(true)
    expect(supabase.llamadas.filtros).toEqual([
      ["id", DOCUMENTO],
      ["medio_id", MEDIO],
    ])
    expect(simulados.firmarDescarga).toHaveBeenCalledWith({
      bucket: "documentos",
      ruta: RUTA,
      firmante: { como: "usuario", cliente: supabase.cliente },
      descarga: "Documento de identidad (frente).webp",
    })
  })

  it("sin pedir descarga se firma para verlo en línea", async () => {
    supabase.respuestas.push({ data: FILA, error: null })
    simulados.firmarDescarga.mockResolvedValue(
      exito({ url: "https://firmada", vigenciaSegundos: 300 })
    )
    await firmarDocumento({ documentoId: DOCUMENTO })
    expect(simulados.firmarDescarga).toHaveBeenCalledWith(
      expect.objectContaining({ descarga: undefined })
    )
  })

  it("lo que no es suyo, no existe o no tiene archivo no se firma", async () => {
    supabase.respuestas.push(
      { data: null, error: null },
      {
        data: { ...FILA, metodo: "VIDEOLLAMADA", archivo_path: null },
        error: null,
      }
    )
    expect(await firmarDocumento({ documentoId: DOCUMENTO })).toEqual(
      fallo("no-encontrado")
    )
    expect(await firmarDocumento({ documentoId: DOCUMENTO })).toEqual(
      fallo("no-encontrado")
    )
    expect(await firmarDocumento({ documentoId: "no-es-un-uuid" })).toEqual(
      fallo("no-encontrado")
    )
    expect(simulados.firmarDescarga).not.toHaveBeenCalled()
  })
})
