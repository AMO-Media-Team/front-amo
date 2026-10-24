// @vitest-environment node
/**
 * `firmarArchivoFactura` con el DAL, Supabase y Storage simulados: el DAL va
 * primero, la ruta sale de la fila leída con la sesión (nunca del cliente),
 * debe estar en la carpeta de SU factura y se firma como usuario con un
 * nombre legible.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const FACTURA = "0199f3a0-0000-7000-8000-00000000f001"
const PAGO = "0199f3a0-0000-7000-8000-00000000f002"
const NOTA = "0199f3a0-0000-7000-8000-00000000f003"
const OTRA = "0199f3a0-0000-7000-8000-00000000f0ff"

const estado = vi.hoisted(() => ({
  orden: [] as string[],
  consultas: [] as { tabla: string; filtros: string[] }[],
  fila: { data: null as unknown, error: null as unknown },
  firmas: [] as Record<string, unknown>[],
  firma: {
    ok: true,
    datos: { url: "https://firmada.example/x", vigenciaSegundos: 300 },
  } as unknown,
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/dal", () => ({
  requerirPermiso: vi.fn(async (permiso: string) => {
    estado.orden.push(`dal:${permiso}`)
    return { id: "u1", anuncianteId: "a1" }
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: vi.fn(async () => ({
    from: (tabla: string) => {
      const consulta = { tabla, filtros: [] as string[] }
      estado.consultas.push(consulta)
      const cadena = {
        select: () => cadena,
        eq: (columna: string, valor: string) => {
          consulta.filtros.push(`${columna}=${valor}`)
          return cadena
        },
        not: (columna: string) => {
          consulta.filtros.push(`${columna}!null`)
          return cadena
        },
        maybeSingle: async () => {
          estado.orden.push(`leer:${tabla}`)
          return estado.fila
        },
      }
      return cadena
    },
  })),
}))
vi.mock("@/lib/storage/descargas", () => ({
  MENSAJES_DESCARGA: {
    noEncontrado: "No encontramos el archivo o no tienes acceso a él.",
    inesperado: "No pudimos abrir el archivo. Inténtalo de nuevo.",
  },
  firmarDescarga: vi.fn(async (opciones: Record<string, unknown>) => {
    estado.orden.push("firmar")
    estado.firmas.push(opciones)
    return estado.firma
  }),
}))

const { firmarArchivoFactura } = await import("./actions")

beforeEach(() => {
  estado.orden = []
  estado.consultas = []
  estado.fila = { data: null, error: null }
  estado.firmas = []
  estado.firma = {
    ok: true,
    datos: { url: "https://firmada.example/x", vigenciaSegundos: 300 },
  }
})

describe("firmarArchivoFactura", () => {
  it("firma el PDF de la factura como usuario, con su número en el nombre", async () => {
    estado.fila = {
      data: {
        id: FACTURA,
        numero: "FE1042",
        archivo_path: `factura/${FACTURA}/fe1042.pdf`,
      },
      error: null,
    }
    const resultado = await firmarArchivoFactura({
      tipo: "factura",
      id: FACTURA,
      descargar: true,
    })
    expect(resultado).toEqual({
      ok: true,
      datos: { url: "https://firmada.example/x", vigenciaSegundos: 300 },
    })
    expect(estado.orden).toEqual([
      "dal:facturas.ver_propias",
      "leer:facturas",
      "firmar",
    ])
    // Solo una factura expedida (con consecutivo) tiene archivo que firmar.
    expect(estado.consultas[0]).toEqual({
      tabla: "facturas",
      filtros: [`id=${FACTURA}`, "consecutivo!null"],
    })
    expect(estado.firmas[0]).toMatchObject({
      bucket: "soportes",
      ruta: `factura/${FACTURA}/fe1042.pdf`,
      firmante: { como: "usuario" },
      descarga: "Factura FE1042.pdf",
    })
  })

  it("el soporte de un pago y el PDF de una nota crédito, cada uno desde su fila", async () => {
    estado.fila = {
      data: {
        id: PAGO,
        factura_id: FACTURA,
        fecha_pago: "2026-10-21",
        soporte_path: `pago/${FACTURA}/soporte.png`,
        factura: { numero: "FE1042" },
      },
      error: null,
    }
    await firmarArchivoFactura({ tipo: "pago", id: PAGO, descargar: true })
    expect(estado.firmas[0]).toMatchObject({
      ruta: `pago/${FACTURA}/soporte.png`,
      descarga: "Soporte de pago FE1042 2026-10-21.png",
    })

    estado.fila = {
      data: {
        id: NOTA,
        factura_id: FACTURA,
        numero: "NC7",
        archivo_path: `factura/${FACTURA}/nc7.pdf`,
      },
      error: null,
    }
    await firmarArchivoFactura({ tipo: "nota_credito", id: NOTA })
    expect(estado.consultas.map((c) => c.tabla)).toEqual([
      "pagos_anunciante",
      "notas_credito",
    ])
    // Sin `descargar`, el navegador lo muestra (sin nombre de adjunto).
    expect(estado.firmas[1]).toMatchObject({
      ruta: `factura/${FACTURA}/nc7.pdf`,
      descarga: undefined,
    })
  })

  it("una ruta fuera de la carpeta de su factura no se firma", async () => {
    estado.fila = {
      data: {
        id: PAGO,
        factura_id: FACTURA,
        fecha_pago: "2026-10-21",
        soporte_path: `pago/${OTRA}/ajeno.pdf`,
        factura: { numero: "FE1042" },
      },
      error: null,
    }
    expect(await firmarArchivoFactura({ tipo: "pago", id: PAGO })).toEqual({
      ok: false,
      error: "No encontramos el archivo o no tienes acceso a él.",
    })
    expect(estado.firmas).toEqual([])
  })

  it("sin fila visible (ajena o borrador) o sin archivo, no lo encuentra", async () => {
    expect(
      await firmarArchivoFactura({ tipo: "factura", id: FACTURA })
    ).toEqual({
      ok: false,
      error: "No encontramos el archivo o no tienes acceso a él.",
    })
    estado.fila = {
      data: { id: FACTURA, numero: "FE1", archivo_path: null },
      error: null,
    }
    expect(
      (await firmarArchivoFactura({ tipo: "factura", id: FACTURA })).ok
    ).toBe(false)
    expect(estado.firmas).toEqual([])
  })

  it("una entrada inválida no llega a la BD; un fallo de lectura no filtra detalles", async () => {
    expect((await firmarArchivoFactura({ tipo: "factura", id: "x" })).ok).toBe(
      false
    )
    expect(estado.orden).toEqual(["dal:facturas.ver_propias"])

    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    estado.fila = { data: null, error: { code: "57014" } }
    expect(
      await firmarArchivoFactura({ tipo: "factura", id: FACTURA })
    ).toEqual({
      ok: false,
      error: "No pudimos abrir el archivo. Inténtalo de nuevo.",
    })
    expect(error).toHaveBeenCalledWith(
      "[facturas-anunciante] firmarArchivoFactura falló (57014)"
    )
    error.mockRestore()
  })

  it("si Storage no tiene el objeto (datos demo), devuelve su mensaje", async () => {
    estado.fila = {
      data: {
        id: FACTURA,
        numero: "DEMO1",
        archivo_path: `factura/${FACTURA}/DEMO1.pdf`,
      },
      error: null,
    }
    estado.firma = {
      ok: false,
      error: "No encontramos el archivo o no tienes acceso a él.",
    }
    expect(
      await firmarArchivoFactura({ tipo: "factura", id: FACTURA })
    ).toEqual({
      ok: false,
      error: "No encontramos el archivo o no tienes acceso a él.",
    })
  })
})
