import { describe, expect, it } from "vitest"

import {
  abreviarCodigo,
  accionesDocumentoSoporte,
  type ContextoDocumento,
  descargasDocumento,
  type FilaDocumentoSoporte,
  fichaDocumentoSoporte,
  leerNumeracion,
  nombreDescargaArchivo,
  situacionDocumento,
} from "./presentacion"
import type { DocumentoSoporteFicha } from "./tipos"

const CUDS = "ab".repeat(48)

function fila(
  cambios: Partial<FilaDocumentoSoporte> & Pick<FilaDocumentoSoporte, "id">
): FilaDocumentoSoporte {
  return {
    estado: "EMITIDO",
    numero: "DS10",
    fecha_emision: "2026-10-17",
    valor_total: 360000,
    cuds: null,
    cuds_registrado_at: null,
    archivo_path: null,
    archivo_proveedor_path: null,
    nota_ajuste_numero: null,
    nota_ajuste_cude: null,
    nota_ajuste_path: null,
    nota_ajuste_at: null,
    anulado_at: null,
    created_at: "2026-10-17T15:00:00Z",
    ...cambios,
  }
}

const EMITIDO: DocumentoSoporteFicha = {
  id: "d1",
  estado: "EMITIDO",
  numero: "DS10",
  fechaEmision: "2026-10-17",
  valorTotal: 360000,
  cuds: null,
  cudsRegistradoAt: null,
  archivoPath: "documento_soporte/d1/a.pdf",
  archivoProveedorPath: "documento_soporte/d1/b.json",
  notaAjuste: null,
  anteriores: [],
}

const NOTA = {
  numero: "NA1",
  cude: null,
  archivoPath: "documento_soporte/d1/n.pdf",
  registradaAt: "2026-10-18T15:00:00Z",
}

function contexto(cambios: Partial<ContextoDocumento> = {}): ContextoDocumento {
  return {
    estadoLiquidacion: "APROBADA",
    documento: EMITIDO,
    numeracion: "PLATAFORMA",
    puedeGestionar: true,
    ...cambios,
  }
}

describe("fichaDocumentoSoporte", () => {
  it("sin filas no hay documento", () => {
    expect(fichaDocumentoSoporte([])).toBeNull()
  })

  it("el vigente va al frente y los anulados, del más reciente al más antiguo", () => {
    const ficha = fichaDocumentoSoporte([
      fila({
        id: "a",
        estado: "ANULADO",
        numero: "DS8",
        anulado_at: "2026-10-10T10:00:00Z",
        created_at: "2026-10-01T10:00:00Z",
        cuds: CUDS,
        nota_ajuste_numero: "NA7",
        nota_ajuste_path: "documento_soporte/a/n.pdf",
        nota_ajuste_at: "2026-10-09T10:00:00Z",
      }),
      fila({
        id: "c",
        valor_total: "360000.00" as unknown as number,
        cuds: CUDS,
        cuds_registrado_at: "2026-10-18T10:00:00Z",
        created_at: "2026-10-15T10:00:00Z",
        nota_ajuste_numero: "NA9",
        nota_ajuste_cude: "cude",
        nota_ajuste_path: "documento_soporte/c/n.pdf",
        nota_ajuste_at: "2026-10-19T10:00:00Z",
      }),
      fila({
        id: "b",
        estado: "ANULADO",
        numero: "DS9",
        anulado_at: "2026-10-14T10:00:00Z",
        created_at: "2026-10-11T10:00:00Z",
      }),
    ])
    expect(ficha).toMatchObject({
      id: "c",
      estado: "EMITIDO",
      valorTotal: 360000,
      cuds: CUDS,
      notaAjuste: {
        numero: "NA9",
        cude: "cude",
        archivoPath: "documento_soporte/c/n.pdf",
        registradaAt: "2026-10-19T10:00:00Z",
      },
    })
    expect(ficha?.anteriores).toEqual([
      {
        id: "b",
        numero: "DS9",
        anuladoAt: "2026-10-14T10:00:00Z",
        notaAjusteNumero: null,
      },
      {
        id: "a",
        numero: "DS8",
        anuladoAt: "2026-10-10T10:00:00Z",
        notaAjusteNumero: "NA7",
      },
    ])
  })

  it("si todos se anularon, el último es el principal y no se repite en el historial", () => {
    const ficha = fichaDocumentoSoporte([
      fila({ id: "a", estado: "ANULADO", created_at: "2026-10-01T10:00:00Z" }),
      fila({ id: "b", estado: "ANULADO", created_at: "2026-10-05T10:00:00Z" }),
    ])
    expect(ficha?.id).toBe("b")
    expect(ficha?.anteriores.map((anterior) => anterior.id)).toEqual(["a"])
  })
})

describe("accionesDocumentoSoporte", () => {
  it("sin permiso solo descarga", () => {
    expect(
      accionesDocumentoSoporte(contexto({ puedeGestionar: false }))
    ).toEqual({
      emitir: false,
      registrarExpedido: false,
      generarArchivos: null,
      registrarCuds: false,
      registrarNotaAjuste: false,
      anular: false,
      descargas: ["pdf", "proveedor"],
    })
  })

  it("aprobada sin documento emitido: emitir o registrar el del proveedor", () => {
    for (const documento of [
      null,
      { ...EMITIDO, estado: "BORRADOR" as const, numero: null },
      { ...EMITIDO, estado: "ANULADO" as const },
    ]) {
      expect(accionesDocumentoSoporte(contexto({ documento }))).toMatchObject({
        emitir: true,
        registrarExpedido: false,
      })
      expect(
        accionesDocumentoSoporte(
          contexto({ documento, numeracion: "PROVEEDOR" })
        )
      ).toMatchObject({ emitir: false, registrarExpedido: true })
    }
  })

  it("en borrador o anulada no se emite nada", () => {
    for (const estadoLiquidacion of ["BORRADOR", "ANULADA"] as const) {
      expect(
        accionesDocumentoSoporte(
          contexto({ estadoLiquidacion, documento: null })
        )
      ).toMatchObject({ emitir: false, registrarExpedido: false })
    }
  })

  it("emitido sin CUDS: registrar CUDS, volver a generar y anular directo", () => {
    expect(accionesDocumentoSoporte(contexto())).toMatchObject({
      generarArchivos: "regenerar",
      registrarCuds: true,
      registrarNotaAjuste: false,
      anular: true,
    })
    expect(
      accionesDocumentoSoporte(
        contexto({ documento: { ...EMITIDO, archivoProveedorPath: null } })
      ).generarArchivos
    ).toBe("faltan")
  })

  it("con CUDS: primero la nota de ajuste, después anular (D38)", () => {
    const conCuds = { ...EMITIDO, cuds: CUDS }
    expect(
      accionesDocumentoSoporte(contexto({ documento: conCuds }))
    ).toMatchObject({
      registrarCuds: false,
      registrarNotaAjuste: true,
      anular: false,
    })
    expect(
      accionesDocumentoSoporte(
        contexto({ documento: { ...conCuds, notaAjuste: NOTA } })
      )
    ).toMatchObject({
      registrarNotaAjuste: false,
      anular: true,
      descargas: ["pdf", "proveedor", "nota_ajuste"],
    })
  })

  it("pagada: CUDS y archivos sí; nota de ajuste y anular no", () => {
    expect(
      accionesDocumentoSoporte(contexto({ estadoLiquidacion: "PAGADA" }))
    ).toMatchObject({
      registrarCuds: true,
      generarArchivos: "regenerar",
      registrarNotaAjuste: false,
      anular: false,
    })
    expect(
      accionesDocumentoSoporte(
        contexto({
          estadoLiquidacion: "PAGADA",
          documento: { ...EMITIDO, cuds: CUDS },
        })
      )
    ).toMatchObject({ registrarNotaAjuste: false, anular: false })
  })

  it("con numeración del proveedor no se generan archivos (su PDF es el que vale)", () => {
    expect(
      accionesDocumentoSoporte(
        contexto({
          numeracion: "PROVEEDOR",
          documento: { ...EMITIDO, cuds: CUDS, archivoProveedorPath: null },
        })
      )
    ).toMatchObject({ generarArchivos: null, descargas: ["pdf"] })
  })
})

describe("situacionDocumento", () => {
  it("«Documento soporte requerido» mientras la aprobada no lo tenga", () => {
    expect(situacionDocumento(contexto({ documento: null }))).toMatchObject({
      tono: "aviso",
      titulo: "Documento soporte requerido",
    })
    const anulado = situacionDocumento(
      contexto({
        documento: { ...EMITIDO, estado: "ANULADO" },
        numeracion: "PROVEEDOR",
        puedeGestionar: false,
      })
    )
    expect(anulado.detalle).toMatch(/^El documento DS10 se anuló\. Expídelo/)
    expect(anulado.detalle).toMatch(
      /Lo hace quien puede aprobar liquidaciones\.$/
    )
  })

  it("el siguiente paso según el CUDS y la nota de ajuste", () => {
    expect(situacionDocumento(contexto()).titulo).toBe(
      "Pendiente de transmisión a la DIAN"
    )
    expect(
      situacionDocumento(contexto({ documento: { ...EMITIDO, cuds: CUDS } }))
        .titulo
    ).toBe("Transmitido a la DIAN")
    expect(
      situacionDocumento(
        contexto({ documento: { ...EMITIDO, cuds: CUDS, notaAjuste: NOTA } })
      )
    ).toMatchObject({ titulo: "Nota de ajuste registrada", tono: "aviso" })
  })

  it("borrador y anulada lo explican sin ofrecer nada", () => {
    expect(
      situacionDocumento(
        contexto({ estadoLiquidacion: "BORRADOR", documento: null })
      ).titulo
    ).toBe("Se emite al aprobar la liquidación")
    expect(
      situacionDocumento(contexto({ estadoLiquidacion: "ANULADA" })).titulo
    ).toBe("Liquidación anulada")
  })
})

describe("leerNumeracion", () => {
  it("solo «PROVEEDOR» cambia el sistema que numera", () => {
    expect(leerNumeracion("PROVEEDOR")).toBe("PROVEEDOR")
    expect(leerNumeracion("PLATAFORMA")).toBe("PLATAFORMA")
    expect(leerNumeracion(undefined)).toBe("PLATAFORMA")
    expect(leerNumeracion("proveedor")).toBe("PLATAFORMA")
  })
})

describe("textos", () => {
  it("nombres de descarga y código abreviado", () => {
    expect(nombreDescargaArchivo("pdf", "DS10")).toBe(
      "Documento soporte DS10.pdf"
    )
    expect(nombreDescargaArchivo("proveedor", "DS10")).toBe(
      "Documento soporte DS10 para el proveedor.json"
    )
    expect(nombreDescargaArchivo("nota_ajuste", null)).toBe(
      "Nota de ajuste del documento soporte.pdf"
    )
    expect(abreviarCodigo(CUDS)).toBe("abababab…ababab")
    expect(abreviarCodigo("corto")).toBe("corto")
    expect(descargasDocumento(null)).toEqual([])
  })
})
