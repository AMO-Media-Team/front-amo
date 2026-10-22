import { describe, expect, it } from "vitest"

import { formatearFecha } from "@/lib/format"

import type { ResumenDocumentos, Situacion } from "./situacion"
import {
  detallesResumen,
  explicarNivelElegido,
  fechaDeDia,
  lineaFechas,
  siguientePaso,
  tituloResumen,
} from "./textos"
import type { DocumentoCargado } from "./tipos"

function resumen(cambios: Partial<ResumenDocumentos> = {}): ResumenDocumentos {
  return {
    total: 4,
    aprobados: 0,
    enRevision: 0,
    porCorregir: 0,
    faltan: 0,
    voluntarios: 0,
    porVencer: 0,
    completo: false,
    todoCargado: false,
    ...cambios,
  }
}

function documento(cambios: Partial<DocumentoCargado> = {}): DocumentoCargado {
  return {
    id: "d1",
    tipo: "CERT_BANCARIA",
    estado: "APROBADO",
    metodo: "ARCHIVO",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-10-01T15:00:00Z",
    revisadoAt: null,
    formato: "application/pdf",
    ...cambios,
  }
}

describe("fechaDeDia", () => {
  it("formatea un día sin correrlo por la zona horaria", () => {
    expect(formatearFecha(fechaDeDia("2027-01-01"))).toBe(
      formatearFecha(new Date("2027-01-01T17:00:00Z"))
    )
    expect(formatearFecha(fechaDeDia("2027-01-01"))).toMatch(/^1 /)
  })
})

describe("tituloResumen", () => {
  it("dice lo más urgente primero", () => {
    expect(tituloResumen(resumen({ total: 0 }))).toBe(
      "Este nivel no pide documentos"
    )
    expect(tituloResumen(resumen({ completo: true, aprobados: 4 }))).toBe(
      "Tus documentos están al día"
    )
    expect(tituloResumen(resumen({ porCorregir: 1, faltan: 2 }))).toBe(
      "Tienes 1 documento por corregir"
    )
    expect(tituloResumen(resumen({ porCorregir: 2 }))).toBe(
      "Tienes 2 documentos por corregir"
    )
    expect(tituloResumen(resumen({ faltan: 1 }))).toBe("Te falta 1 documento")
    expect(tituloResumen(resumen({ faltan: 3 }))).toBe("Te faltan 3 documentos")
  })

  it("con todo cargado: en revisión, o solo la prueba de vida opcional", () => {
    expect(
      tituloResumen(resumen({ aprobados: 2, enRevision: 1, voluntarios: 1 }))
    ).toBe("Ya cargaste lo necesario: lo estamos revisando")
    expect(tituloResumen(resumen({ aprobados: 3, voluntarios: 1 }))).toBe(
      "Solo falta verificar tu identidad"
    )
  })
})

describe("detallesResumen", () => {
  it("lista solo lo que tiene algo, con el plural correcto", () => {
    expect(detallesResumen(resumen({ aprobados: 4, completo: true }))).toEqual(
      []
    )
    expect(
      detallesResumen(
        resumen({
          enRevision: 2,
          porCorregir: 1,
          faltan: 1,
          voluntarios: 1,
          porVencer: 1,
        })
      )
    ).toEqual([
      "2 en revisión",
      "1 por corregir",
      "1 sin cargar",
      "1 opcional sin cargar",
      "1 por vencer",
    ])
    expect(detallesResumen(resumen({ voluntarios: 2 }))).toEqual([
      "2 opcionales sin cargar",
    ])
  })
})

describe("siguientePaso", () => {
  it("si ya lo envió, está en la cola (aunque falte algo)", () => {
    expect(
      siguientePaso(
        { estado: "PENDIENTE", enviadoVerificacionAt: "2026-10-20T12:00:00Z" },
        false
      )
    ).toEqual({ tipo: "en-cola", desde: "2026-10-20T12:00:00Z" })
  })

  it("en alta y con lo necesario cargado, puede enviarlo", () => {
    expect(
      siguientePaso({ estado: "PENDIENTE", enviadoVerificacionAt: null }, true)
    ).toEqual({ tipo: "enviar" })
    // Rechazado: lo corrige y lo vuelve a enviar.
    expect(
      siguientePaso(
        { estado: "RECHAZADO", enviadoVerificacionAt: "2026-10-01T12:00:00Z" },
        true
      )
    ).toEqual({ tipo: "enviar" })
  })

  it("sin lo necesario o ya verificado no hay paso", () => {
    expect(
      siguientePaso({ estado: "PENDIENTE", enviadoVerificacionAt: null }, false)
    ).toBeNull()
    expect(
      siguientePaso(
        { estado: "VERIFICADO", enviadoVerificacionAt: "2026-10-01T12:00:00Z" },
        true
      )
    ).toBeNull()
  })
})

describe("explicarNivelElegido", () => {
  const enAlta = { estado: "PENDIENTE", nivel: 0 } as const
  const nivel2 = { estado: "VERIFICADO", nivel: 2 } as const

  it("en alta: el de entrada, o verificarse directo en uno mayor", () => {
    expect(explicarNivelElegido(1, enAlta)).toMatch(/^Es el nivel de entrada/)
    expect(explicarNivelElegido(3, enAlta)).toMatch(
      /verificarte directamente en ese nivel/
    )
  })

  it("verificado: mantener el actual, subir o uno inferior", () => {
    expect(explicarNivelElegido(2, nivel2)).toMatch(/^Es tu nivel actual:/)
    expect(explicarNivelElegido(3, nivel2)).toMatch(/^Para subir al nivel 3/)
    expect(explicarNivelElegido(1, nivel2)).toMatch(
      /inferior al tuyo \(nivel 2\)/
    )
    expect(explicarNivelElegido(3, { estado: "VERIFICADO", nivel: 3 })).toMatch(
      /el más alto/
    )
  })
})

describe("lineaFechas", () => {
  it("lo que falta no tiene fechas", () => {
    expect(lineaFechas({ tipo: "falta" })).toBeNull()
  })

  it("en revisión: solo la carga", () => {
    const pendiente = documento({ estado: "PENDIENTE" })
    expect(
      lineaFechas({ tipo: "en-revision", documento: pendiente, vigente: null })
    ).toBe(`Cargado el ${formatearFecha(pendiente.cargadoAt)}`)
  })

  it("aprobado: carga, revisión y vencimiento", () => {
    const aprobado = documento({
      revisadoAt: "2026-10-02T15:00:00Z",
      venceEl: "2027-10-02",
    })
    const situacion: Situacion = {
      tipo: "aprobado",
      documento: aprobado,
      diasParaVencer: 345,
      porVencer: false,
      reemplazoRechazado: null,
    }
    expect(lineaFechas(situacion)).toBe(
      [
        `Cargado el ${formatearFecha(aprobado.cargadoAt)}`,
        `revisado el ${formatearFecha("2026-10-02T15:00:00Z")}`,
        `vence el ${formatearFecha(fechaDeDia("2027-10-02"))}`,
      ].join(" · ")
    )
  })

  it("vencido: cuándo venció", () => {
    const vencido = documento({ estado: "VENCIDO", venceEl: "2026-10-01" })
    expect(lineaFechas({ tipo: "vencido", documento: vencido })).toContain(
      `venció el ${formatearFecha(fechaDeDia("2026-10-01"))}`
    )
  })

  it("una videollamada dice cuándo se verificó", () => {
    const videollamada = documento({
      tipo: "PRUEBA_VIDA",
      metodo: "VIDEOLLAMADA",
      revisadoAt: "2026-10-05T15:00:00Z",
      formato: null,
    })
    expect(
      lineaFechas({
        tipo: "aprobado",
        documento: videollamada,
        diasParaVencer: null,
        porVencer: false,
        reemplazoRechazado: null,
      })
    ).toBe(
      `Verificada por videollamada el ${formatearFecha("2026-10-05T15:00:00Z")}`
    )
  })
})
