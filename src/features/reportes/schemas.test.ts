import { describe, expect, it } from "vitest"

import { SLUGS_REPORTE } from "./catalogo"
import { esquemaExportacionReporte, FORMATOS_REPORTE } from "./schemas"

const FILTROS = {
  periodo: "mesAnterior",
  desde: null,
  hasta: null,
  departamento: null,
  anunciante: null,
  sector: null,
  agrupacion: null,
  corte: null,
} as const

describe("esquemaExportacionReporte", () => {
  it("acepta cada reporte del catálogo en Excel y en PDF", () => {
    for (const reporte of SLUGS_REPORTE) {
      for (const formato of FORMATOS_REPORTE) {
        expect(
          esquemaExportacionReporte.safeParse({
            reporte,
            formato,
            filtros: FILTROS,
          }).success
        ).toBe(true)
      }
    }
  })

  it("rechaza reportes y formatos desconocidos", () => {
    expect(
      esquemaExportacionReporte.safeParse({
        reporte: "auditoria",
        formato: "xlsx",
        filtros: FILTROS,
      }).success
    ).toBe(false)
    expect(
      esquemaExportacionReporte.safeParse({
        reporte: "finanzas",
        formato: "csv",
        filtros: FILTROS,
      }).success
    ).toBe(false)
  })

  it("exige el contrato completo de filtros", () => {
    expect(
      esquemaExportacionReporte.safeParse({
        reporte: "finanzas",
        formato: "pdf",
      }).success
    ).toBe(false)
    expect(
      esquemaExportacionReporte.safeParse({
        reporte: "finanzas",
        formato: "pdf",
        filtros: { ...FILTROS, periodo: 5 },
      }).success
    ).toBe(false)
  })
})
