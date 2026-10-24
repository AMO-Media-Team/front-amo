import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  esquemaAnularDocumento,
  esquemaCamposExpedido,
  esquemaCamposNotaAjuste,
  esquemaConfirmarPdf,
  esquemaCuds,
  esquemaFirmarArchivo,
  esquemaPrepararPdf,
  esquemaRegistrarExpedido,
  MENSAJES_CAMPOS,
  mensajeLargoCuds,
  normalizarCuds,
  problemaCuds,
} from "./schemas"

const CUDS = "0123456789abcdef".repeat(6)
const DOCUMENTO = "01a16b3e-4124-7519-b25e-84c8a4317ce3"
const LIQUIDACION = "01a16b3e-4124-7cc1-98e1-980a228c77a6"

function errores(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}): Record<string, string> {
  // Como `desdeErrorZod` + el formulario: el primer mensaje de cada campo.
  const porCampo: Record<string, string> = {}
  for (const issue of resultado.error?.issues ?? []) {
    porCampo[issue.path.map(String).join(".")] ??= issue.message
  }
  return porCampo
}

describe("CUDS", () => {
  it("se normaliza: sin espacios ni saltos de línea, en minúsculas", () => {
    expect(
      normalizarCuds(` ${CUDS.slice(0, 48).toUpperCase()}\n${CUDS.slice(48)} `)
    ).toBe(CUDS)
    expect(esquemaCuds.parse(CUDS.toUpperCase())).toBe(CUDS)
  })

  it("explica qué está mal", () => {
    expect(problemaCuds("")).toBe(MENSAJES_CAMPOS.cudsVacio)
    expect(problemaCuds("xyz")).toBe(MENSAJES_CAMPOS.cudsCaracteres)
    expect(problemaCuds(CUDS.slice(0, 90))).toBe(mensajeLargoCuds(90))
    expect(mensajeLargoCuds(90)).toBe(
      "El CUDS tiene 96 caracteres; el que pegaste tiene 90."
    )
    expect(problemaCuds(CUDS)).toBeNull()
  })
})

describe("documento expedido por el proveedor", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // 23 de octubre de 2026, 9:00 p. m. en Bogotá (ya es 24 en UTC).
    vi.setSystemTime(new Date("2026-10-24T02:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  const valido = {
    prefijo: " pds ",
    consecutivo: "0042",
    fechaEmision: "2026-10-23",
    cuds: CUDS,
  }

  it("normaliza el prefijo y el número", () => {
    expect(esquemaCamposExpedido.parse(valido)).toEqual({
      prefijo: "PDS",
      consecutivo: 42,
      fechaEmision: "2026-10-23",
      cuds: CUDS,
    })
    expect(
      esquemaCamposExpedido.parse({ ...valido, prefijo: "" }).prefijo
    ).toBe("")
  })

  it("cada error queda en su campo", () => {
    expect(
      errores(
        esquemaCamposExpedido.safeParse({
          prefijo: "PRUEBA",
          consecutivo: "PDS42",
          fechaEmision: "2026-10-24",
          cuds: "abc",
        })
      )
    ).toEqual({
      prefijo: MENSAJES_CAMPOS.prefijo,
      consecutivo: MENSAJES_CAMPOS.consecutivo,
      fechaEmision: MENSAJES_CAMPOS.fechaFutura,
      cuds: mensajeLargoCuds(3),
    })
    expect(
      errores(
        esquemaCamposExpedido.safeParse({
          ...valido,
          consecutivo: "",
          fechaEmision: "",
        })
      )
    ).toEqual({
      consecutivo: MENSAJES_CAMPOS.consecutivoVacio,
      fechaEmision: MENSAJES_CAMPOS.fechaVacia,
    })
    expect(
      errores(esquemaCamposExpedido.safeParse({ ...valido, consecutivo: "0" }))
    ).toEqual({ consecutivo: MENSAJES_CAMPOS.consecutivo })
  })

  it("la acción exige además el documento y el PDF cargado", () => {
    expect(
      errores(
        esquemaRegistrarExpedido.safeParse({
          ...valido,
          documentoId: "x",
          archivoPath: "",
        })
      )
    ).toEqual({
      documentoId: "Identificador inválido.",
      archivoPath: MENSAJES_CAMPOS.archivoRequerido,
    })
  })
})

describe("nota de ajuste", () => {
  it("número en mayúsculas y CUDE opcional", () => {
    expect(
      esquemaCamposNotaAjuste.parse({ numero: " na  12 ", cude: "" })
    ).toEqual({ numero: "NA 12", cude: null })
    expect(
      esquemaCamposNotaAjuste.parse({ numero: "NA-1", cude: " AB CD " })
    ).toEqual({ numero: "NA-1", cude: "abcd" })
  })

  it("rechaza un número vacío o con símbolos y un CUDE largo", () => {
    expect(
      errores(
        esquemaCamposNotaAjuste.safeParse({
          numero: "",
          cude: "a".repeat(201),
        })
      )
    ).toEqual({
      numero: MENSAJES_CAMPOS.numeroNotaVacio,
      cude: MENSAJES_CAMPOS.cude,
    })
    expect(
      errores(esquemaCamposNotaAjuste.safeParse({ numero: "#12", cude: "" }))
    ).toEqual({ numero: MENSAJES_CAMPOS.numeroNota })
  })
})

describe("anular, firmar y subir el PDF", () => {
  it("anular exige un motivo de al menos 5 caracteres", () => {
    expect(
      errores(
        esquemaAnularDocumento.safeParse({
          documentoId: DOCUMENTO,
          motivo: " x ",
        })
      )
    ).toEqual({ motivo: "Describe el motivo (al menos 5 caracteres)." })
  })

  it("solo se firman los tres archivos del documento", () => {
    expect(
      esquemaFirmarArchivo.safeParse({ documentoId: DOCUMENTO, archivo: "pdf" })
        .success
    ).toBe(true)
    expect(
      esquemaFirmarArchivo.safeParse({
        documentoId: DOCUMENTO,
        archivo: "otro",
      }).success
    ).toBe(false)
  })

  const descripcion = {
    nombre: "DS-42.pdf",
    tipo: "application/pdf",
    tamano: 120_000,
    sha256: null,
    dimensiones: null,
    duracionSeg: null,
    conMiniatura: false,
  }

  it("solo PDF de hasta 10 MB", () => {
    expect(
      esquemaPrepararPdf.safeParse({
        liquidacionId: LIQUIDACION,
        uso: "expedido",
        archivo: descripcion,
      }).success
    ).toBe(true)
    expect(
      esquemaPrepararPdf.safeParse({
        liquidacionId: LIQUIDACION,
        uso: "expedido",
        archivo: { ...descripcion, tipo: "image/png" },
      }).success
    ).toBe(false)
    expect(
      esquemaPrepararPdf.safeParse({
        liquidacionId: LIQUIDACION,
        uso: "nota_ajuste",
        archivo: { ...descripcion, tamano: 11 * 1024 * 1024 },
      }).success
    ).toBe(false)
  })

  it("al confirmar llegan el bucket y la ruta", () => {
    expect(
      esquemaConfirmarPdf.safeParse({
        liquidacionId: LIQUIDACION,
        uso: "nota_ajuste",
        archivo: {
          ...descripcion,
          bucket: "soportes",
          ruta: `documento_soporte/${DOCUMENTO}/x.pdf`,
          rutaMiniatura: null,
        },
      }).success
    ).toBe(true)
  })
})
