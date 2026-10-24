// @vitest-environment node
/**
 * `generarArchivosDocumento` con la BD, Storage y el PDF simulados (hallazgo [32] de la revisión de la
 * fase 5): una vez guardado el archivo `AMO-DS-1`, ese es el documento que se transmitió, así que el PDF
 * nuevo (al registrar el CUDS o con «Volver a generar») sale de él: no se vuelven a revelar los datos del
 * medio ni se reemplaza el archivo. Solo en la emisión, o si ese objeto no existe (datos demo), se generan
 * los dos con los datos vigentes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { componerModelo, esquemaDatosDocumentoSoporte } from "./datos"
import { RESPUESTA_BD } from "./datos.fixture"
import { MENSAJES_DOCUMENTO } from "./errores"
import {
  archivoProveedorDocumentoSoporte,
  serializarArchivoProveedor,
} from "./salidas"

const DOCUMENTO = RESPUESTA_BD.documento.id
const CARPETA = `documento_soporte/${DOCUMENTO}`
const RUTA_JSON = `${CARPETA}/0192f3a4-5b6c-7d8e-9f01-0000000000aa.json`
const CUDS = "c0ffee".repeat(16)
const AHORA = new Date("2026-10-23T15:00:00Z")

/** El medio cambió su titular, su documento y su dirección después de la emisión. */
const VENDEDOR_ACTUAL = {
  titular_nombre: "Titular Nuevo",
  tipo_documento: "CE",
  numero_documento_cifrado: "cifrado",
  direccion: "Otra dirección 1",
}

/** El archivo que se generó y transmitió al emitir. */
const TRANSMITIDO = archivoProveedorDocumentoSoporte(
  componerModelo(esquemaDatosDocumentoSoporte.parse(RESPUESTA_BD), {
    titular: "Tatiana Martínez Ríos",
    tipoDocumento: "CC",
    numeroDocumento: "1023456789",
    direccion: "Cll 34 # 66-34",
  }),
  new Date("2026-10-17T20:05:00Z")
)

const estado = vi.hoisted(() => ({
  datos: { data: null as unknown, error: null as unknown },
  descarga: { data: null as unknown, error: null as unknown },
  descargadas: [] as string[],
  rpc: [] as { nombre: string; argumentos: Record<string, unknown> }[],
  errorAdjuntar: null as unknown,
  subidas: [] as { ruta: string; tipo: string }[],
  pdfs: [] as Record<string, unknown>[],
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    rpc: async () => estado.datos,
  })),
}))
vi.mock("@/lib/export/logo-documentos.generated", () => ({
  LOGO_DOCUMENTOS: null,
}))
vi.mock("@/lib/export/documento-soporte-pdf", () => ({
  construirDocumentoSoportePdf: vi.fn(
    async (datos: Record<string, unknown>) => {
      estado.pdfs.push(datos)
      return { output: () => new ArrayBuffer(8) }
    }
  ),
}))
vi.mock("@/features/mi-medio/cifrado-pago", () => ({
  descifrarNumeroDocumento: vi.fn(() => "998877"),
}))
vi.mock("@/lib/storage/subidas-servidor", () => ({
  subirComoServicio: vi.fn(
    async (opciones: {
      destino: { bucket: string; ruta: string }
      tipo: string
    }) => {
      estado.subidas.push({ ruta: opciones.destino.ruta, tipo: opciones.tipo })
      return { ok: true, datos: opciones.destino }
    }
  ),
}))

const { generarArchivosDocumento } = await import("./generacion")

function contexto() {
  return {
    actorId: "u1",
    sessionId: "s1",
    admin: {
      rpc: async (nombre: string, argumentos: Record<string, unknown>) => {
        estado.rpc.push({ nombre, argumentos })
        if (nombre === "revelar_privado_srv") {
          return { data: VENDEDOR_ACTUAL, error: null }
        }
        return { data: null, error: estado.errorAdjuntar }
      },
      storage: {
        from: (bucket: string) => ({
          download: async (ruta: string) => {
            estado.descargadas.push(`${bucket}/${ruta}`)
            return estado.descarga
          },
        }),
      },
    },
  } as unknown as Parameters<typeof generarArchivosDocumento>[0]
}

/** La respuesta de `datos_documento_soporte` con otros valores en el documento. */
function datosBd(documento: Record<string, string | null>) {
  return {
    data: {
      ...RESPUESTA_BD,
      documento: { ...RESPUESTA_BD.documento, ...documento },
    },
    error: null,
  }
}

function adjuntado() {
  return estado.rpc.find(
    ({ nombre }) => nombre === "adjuntar_archivos_documento_soporte_srv"
  )?.argumentos
}

function revelo(): boolean {
  return estado.rpc.some(({ nombre }) => nombre === "revelar_privado_srv")
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  estado.datos = datosBd({ cuds: CUDS, archivo_proveedor_path: RUTA_JSON })
  estado.descarga = {
    data: new Blob([serializarArchivoProveedor(TRANSMITIDO)], {
      type: "application/json",
    }),
    error: null,
  }
  estado.descargadas = []
  estado.rpc = []
  estado.errorAdjuntar = null
  estado.subidas = []
  estado.pdfs = []
})

describe("generarArchivosDocumento con el archivo para el proveedor ya guardado", () => {
  it("rehace solo el PDF desde ese archivo, con el CUDS, sin revelar ni reemplazar el archivo", async () => {
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )

    expect(resultado).toEqual({ ok: true, datos: { numero: "DEMO2187" } })
    expect(estado.descargadas).toEqual([`soportes/${RUTA_JSON}`])
    expect(revelo()).toBe(false)
    expect(estado.subidas).toHaveLength(1)
    expect(estado.subidas[0].tipo).toBe("application/pdf")
    expect(estado.subidas[0].ruta.startsWith(`${CARPETA}/`)).toBe(true)
    expect(adjuntado()).toMatchObject({
      p_documento_id: DOCUMENTO,
      p_pdf_path: estado.subidas[0].ruta,
      p_archivo_proveedor_path: null,
    })
    // El vendedor es el del documento transmitido, no el de hoy.
    expect(estado.pdfs[0]).toMatchObject({
      numero: "DEMO2187",
      cuds: CUDS,
      vendedor: {
        nombre: "Tatiana Martínez Ríos",
        documento: "CC 1.023.456.789",
        direccion: "Cll 34 # 66-34",
      },
      generadoAt: AHORA,
    })
  })

  it("si ese objeto no existe en Storage (datos demo), genera los dos con los datos vigentes", async () => {
    estado.descarga = {
      data: null,
      error: { name: "StorageApiError", status: 400, statusCode: "404" },
    }
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )

    expect(resultado.ok).toBe(true)
    expect(revelo()).toBe(true)
    expect(estado.subidas.map(({ tipo }) => tipo).sort()).toEqual([
      "application/json",
      "application/pdf",
    ])
    const json = estado.subidas.find(({ tipo }) => tipo === "application/json")
    expect(adjuntado()).toMatchObject({ p_archivo_proveedor_path: json?.ruta })
    expect(estado.pdfs[0]).toMatchObject({
      cuds: CUDS,
      vendedor: { nombre: "Titular Nuevo", direccion: "Otra dirección 1" },
    })
  })

  it("un fallo de Storage que no es «no existe» no genera nada", async () => {
    estado.descarga = {
      data: null,
      error: { name: "StorageUnknownError", status: 500 },
    }
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )

    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_DOCUMENTO.archivoProveedorIlegible,
    })
    expect(revelo()).toBe(false)
    expect(estado.subidas).toEqual([])
    expect(adjuntado()).toBeUndefined()
  })

  it("un archivo ilegible o de otro documento no se usa ni se reemplaza", async () => {
    for (const contenido of [
      "{ no es json",
      JSON.stringify({ ...TRANSMITIDO, formato: "OTRO" }),
      serializarArchivoProveedor({
        ...TRANSMITIDO,
        documento: {
          ...TRANSMITIDO.documento,
          id: "0192f3a4-5b6c-7d8e-9f01-0000000000bb",
        },
      }),
    ]) {
      estado.descarga = { data: new Blob([contenido]), error: null }
      const resultado = await generarArchivosDocumento(
        contexto(),
        DOCUMENTO,
        AHORA
      )
      expect(resultado).toEqual({
        ok: false,
        error: MENSAJES_DOCUMENTO.archivoProveedorIlegible,
      })
    }
    expect(revelo()).toBe(false)
    expect(estado.subidas).toEqual([])
  })

  it("una ruta fuera de la carpeta del documento ni siquiera se descarga", async () => {
    estado.datos = datosBd({
      archivo_proveedor_path:
        "documento_soporte/0192f3a4-5b6c-7d8e-9f01-0000000000bb/x.json",
    })
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )
    expect(resultado.ok).toBe(false)
    expect(estado.descargadas).toEqual([])
    expect(estado.subidas).toEqual([])
  })

  it("si la BD no guarda el PDF, lo dice", async () => {
    estado.errorAdjuntar = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details: "Los archivos se adjuntan a un documento soporte emitido.",
      hint: null,
    }
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )
    expect(resultado.ok).toBe(false)
  })
})

describe("generarArchivosDocumento en la emisión", () => {
  it("sin archivo guardado, revela los datos del medio y genera los dos", async () => {
    estado.datos = datosBd({ archivo_path: null, archivo_proveedor_path: null })
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )

    expect(resultado).toEqual({ ok: true, datos: { numero: "DEMO2187" } })
    expect(estado.descargadas).toEqual([])
    expect(revelo()).toBe(true)
    expect(estado.subidas).toHaveLength(2)
    expect(adjuntado()?.p_archivo_proveedor_path).toEqual(
      expect.stringMatching(new RegExp(`^${CARPETA}/`))
    )
  })

  it("un documento que ya no está emitido no genera nada", async () => {
    estado.datos = datosBd({ estado: "ANULADO" })
    const resultado = await generarArchivosDocumento(
      contexto(),
      DOCUMENTO,
      AHORA
    )
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_DOCUMENTO.documentoNoEmitido,
    })
    expect(estado.descargadas).toEqual([])
    expect(estado.subidas).toEqual([])
  })
})
