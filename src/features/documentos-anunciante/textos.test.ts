import { describe, expect, it } from "vitest"

import type { ResumenDocumentos, Situacion } from "./situacion"
import { detallesResumen, lineaFechas, tituloResumen } from "./textos"
import type { DocumentoAnunciante } from "./tipos"

function resumen(cambios: Partial<ResumenDocumentos> = {}): ResumenDocumentos {
  return {
    total: 2,
    aprobados: 0,
    enRevision: 0,
    porCorregir: 0,
    faltan: 2,
    porVencer: 0,
    completo: false,
    listoParaEnviar: false,
    pendientes: [],
    ...cambios,
  }
}

const DOCUMENTO: DocumentoAnunciante = {
  id: "d1",
  tipo: "RUT",
  estado: "APROBADO",
  observaciones: null,
  venceEl: "2026-12-31",
  cargadoAt: "2026-10-01T15:00:00Z",
  revisadoAt: "2026-10-02T15:00:00Z",
  formato: "application/pdf",
}

describe("tituloResumen", () => {
  it("dice lo más urgente primero", () => {
    expect(tituloResumen(resumen())).toBe("Te faltan 2 documentos")
    expect(tituloResumen(resumen({ faltan: 1 }))).toBe("Te falta 1 documento")
    expect(tituloResumen(resumen({ faltan: 1, porCorregir: 1 }))).toBe(
      "Tienes 1 documento por corregir"
    )
    expect(tituloResumen(resumen({ faltan: 0, porCorregir: 2 }))).toBe(
      "Tienes 2 documentos por corregir"
    )
    expect(
      tituloResumen(
        resumen({ faltan: 0, enRevision: 2, listoParaEnviar: true })
      )
    ).toBe("Ya cargaste lo necesario")
  })

  it("completo, avisa si algo vence pronto", () => {
    expect(
      tituloResumen(resumen({ faltan: 0, aprobados: 2, completo: true }))
    ).toBe("Tus documentos están aprobados")
    expect(
      tituloResumen(
        resumen({ faltan: 0, aprobados: 2, completo: true, porVencer: 1 })
      )
    ).toBe("Tus documentos están aprobados; alguno vence pronto")
  })
})

describe("detallesResumen", () => {
  it("solo los conteos que tienen algo", () => {
    expect(
      detallesResumen(resumen({ faltan: 1, enRevision: 1, porVencer: 1 }))
    ).toEqual(["1 en revisión", "1 sin cargar", "1 por vencer"])
    expect(detallesResumen(resumen({ faltan: 0 }))).toEqual([])
  })
})

describe("lineaFechas", () => {
  it("sin cargar no hay línea", () => {
    expect(lineaFechas({ tipo: "falta" })).toBeNull()
  })

  it("aprobado: carga, revisión y vencimiento en Bogotá", () => {
    const situacion: Situacion = {
      tipo: "aprobado",
      documento: DOCUMENTO,
      diasParaVencer: 70,
      porVencer: false,
      reemplazoRechazado: null,
    }
    const linea = lineaFechas(situacion)
    expect(linea).toBe(
      "Cargado el 1 de oct de 2026 · revisado el 2 de oct de 2026 · vence el 31 de dic de 2026"
    )
  })

  it("vencido dice cuándo venció; en revisión, solo la carga", () => {
    expect(
      lineaFechas({
        tipo: "vencido",
        documento: { ...DOCUMENTO, estado: "VENCIDO", venceEl: "2026-10-15" },
      })
    ).toBe("Cargado el 1 de oct de 2026 · venció el 15 de oct de 2026")
    expect(
      lineaFechas({
        tipo: "en-revision",
        documento: { ...DOCUMENTO, estado: "PENDIENTE", revisadoAt: null },
        vigente: null,
      })
    ).toBe("Cargado el 1 de oct de 2026")
  })
})
