import { describe, expect, it } from "vitest"

import {
  DIMENSION,
  DIMENSIONES,
  esDimension,
  parseAsDimension,
} from "./dimensiones"
import { esquemaExportacionMetricas } from "./schemas"

const CAMPANA = "0199f3a0-0000-7000-8000-00000000ca01"

describe("dimensiones", () => {
  it("son los cortes de §7.2.6 y la plataforma va por defecto", () => {
    expect(DIMENSIONES).toEqual(["plataforma", "medio", "municipio", "fecha"])
    expect(parseAsDimension.parseServerSide(undefined)).toBe("plataforma")
    expect(parseAsDimension.parseServerSide("municipio")).toBe("municipio")
    expect(parseAsDimension.parseServerSide("departamento")).toBe("plataforma")
    expect(esDimension("fecha")).toBe(true)
    expect(esDimension("campana")).toBe(false)
  })

  it("cada corte tiene título, columna y descripción", () => {
    for (const dimension of DIMENSIONES) {
      expect(DIMENSION[dimension].titulo).not.toBe("")
      expect(DIMENSION[dimension].descripcion).toMatch(/\.$/)
    }
    expect(DIMENSION.fecha.columna).toBe("Fecha de verificación")
  })
})

describe("esquemaExportacionMetricas", () => {
  it("acepta Excel o PDF con un corte válido", () => {
    expect(
      esquemaExportacionMetricas.parse({
        campanaId: CAMPANA,
        formato: "pdf",
        dimension: "municipio",
      })
    ).toEqual({ campanaId: CAMPANA, formato: "pdf", dimension: "municipio" })
  })

  it("rechaza lo demás con mensajes claros", () => {
    const resultado = esquemaExportacionMetricas.safeParse({
      campanaId: "x",
      formato: "csv",
      dimension: "departamento",
    })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues.map((i) => i.message)).toEqual([
      "La campaña no es válida.",
      "Elige Excel o PDF.",
      "Elige un corte válido.",
    ])
  })
})
