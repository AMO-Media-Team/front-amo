// @vitest-environment node
/**
 * Acciones del documento soporte con el DAL, la sesión, la transición y Storage simulados (hallazgos [8] y
 * [10] de la revisión de la fase 5):
 *
 * - `firmarArchivoDocumentoSoporte` exige `datos_sensibles.ver` además de `liquidaciones.ver`: el PDF, el
 *   archivo para el proveedor y la nota de ajuste llevan el nombre, el documento de identidad y la
 *   dirección del medio. Sin el permiso no se lee la fila ni se firma nada.
 * - `anularDocumentoSoporte` explica el rechazo de la BD cuando la liquidación ya se pagó.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENSAJES_DOCUMENTO } from "./errores"

const DOCUMENTO = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"
const LIQUIDACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  permisos: [] as string[],
  fila: { data: null as unknown, error: null as unknown },
  firmas: [] as Record<string, unknown>[],
  transiciones: [] as Record<string, unknown>[],
  errorTransicion: null as unknown,
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", permisos: [permiso, ...estado.permisos] }
  }),
  tieneAlgunPermiso: vi.fn(
    (usuario: { permisos: string[] }, permisos: readonly string[]) =>
      permisos.some((permiso) => usuario.permisos.includes(permiso))
  ),
}))
vi.mock("@/lib/auth/contexto-actor", () => ({
  contextoDelActor: vi.fn(async () => ({
    actorId: "u1",
    sessionId: "s1",
    admin: {},
  })),
}))
vi.mock("@/lib/negocio/transicionar", () => ({
  transicionar: vi.fn(
    async (_contexto: unknown, solicitud: Record<string, unknown>) => {
      estado.transiciones.push(solicitud)
      return { data: null, error: estado.errorTransicion }
    }
  ),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => {
    const cadena = {
      select: () => cadena,
      eq: () => cadena,
      neq: () => cadena,
      maybeSingle: async () => {
        estado.orden.push("leer:documentos_soporte")
        return estado.fila
      },
    }
    return { from: () => cadena }
  }),
}))
vi.mock("@/lib/storage/descargas", () => ({
  firmarDescarga: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.orden.push("firmar")
    estado.firmas.push(opciones)
    return {
      ok: true,
      datos: { url: "https://firmada.example/x", vigenciaSegundos: 300 },
    }
  }),
}))
vi.mock("@/lib/storage/subidas", () => ({
  MENSAJES_SUBIDA: { noCoincide: "No coincide." },
  confirmarObjeto: vi.fn(),
  prepararSubidaFirmada: vi.fn(),
}))
vi.mock("./generacion", () => ({
  generarArchivosDocumento: vi.fn(),
  informar: vi.fn(),
}))
vi.mock("./queries", () => ({
  numeracionDocumentoSoporte: vi.fn(async () => "PLATAFORMA"),
}))

const { anularDocumentoSoporte, firmarArchivoDocumentoSoporte } =
  await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.permisos = []
  estado.fila = {
    data: {
      id: DOCUMENTO,
      liquidacion_id: LIQUIDACION,
      estado: "EMITIDO",
      numero: "DS10",
      cuds: null,
      archivo_path: `documento_soporte/${DOCUMENTO}/a.pdf`,
      archivo_proveedor_path: `documento_soporte/${DOCUMENTO}/b.json`,
      nota_ajuste_path: `documento_soporte/${DOCUMENTO}/n.pdf`,
    },
    error: null,
  }
  estado.firmas = []
  estado.transiciones = []
  estado.errorTransicion = null
})

describe("firmarArchivoDocumentoSoporte", () => {
  it.each(["pdf", "proveedor", "nota_ajuste"] as const)(
    "sin «Ver datos sensibles» no firma el archivo %s (lleva los datos del medio)",
    async (archivo) => {
      const resultado = await firmarArchivoDocumentoSoporte({
        documentoId: DOCUMENTO,
        archivo,
      })
      expect(resultado).toEqual({
        ok: false,
        error: MENSAJES_DOCUMENTO.sinDatosSensibles,
      })
      expect(estado.orden).toEqual(["dal:liquidaciones.ver"])
      expect(estado.firmas).toEqual([])
    }
  )

  it("con el permiso firma como servicio la ruta de la fila, con un nombre legible", async () => {
    estado.permisos = ["datos_sensibles.ver"]
    const resultado = await firmarArchivoDocumentoSoporte({
      documentoId: DOCUMENTO,
      archivo: "proveedor",
    })
    expect(resultado.ok).toBe(true)
    expect(estado.orden).toEqual([
      "dal:liquidaciones.ver",
      "leer:documentos_soporte",
      "firmar",
    ])
    expect(estado.firmas[0]).toMatchObject({
      bucket: "soportes",
      ruta: `documento_soporte/${DOCUMENTO}/b.json`,
      firmante: { como: "servicio", entidadId: DOCUMENTO },
      descarga: "Documento soporte DS10 para el proveedor.json",
    })
  })
})

describe("anularDocumentoSoporte", () => {
  it("si la liquidación ya se pagó, explica que no se anula y cómo se corrige", async () => {
    estado.errorTransicion = {
      code: "P0001",
      message: "AMO_TRANSICION_INVALIDA",
      details:
        "La liquidación ya se pagó: su documento soporte no se anula; corrígelo con una nota de ajuste.",
      hint: "liquidacion_pagada",
    }
    const resultado = await anularDocumentoSoporte({
      documentoId: DOCUMENTO,
      motivo: "Los datos del vendedor estaban mal.",
    })
    expect(estado.transiciones).toEqual([
      expect.objectContaining({
        entidad: "documentos_soporte",
        id: DOCUMENTO,
        hacia: "ANULADO",
      }),
    ])
    expect(resultado).toEqual({
      ok: false,
      error: MENSAJES_DOCUMENTO.liquidacionPagada,
    })
  })
})
