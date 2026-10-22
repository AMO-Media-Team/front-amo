import { describe, expect, it } from "vitest"

import {
  esquemaCodigoDepartamento,
  esquemaCodigoMunicipio,
  esquemaSegmentacion,
} from "./schemas"

describe("esquemas de territorio", () => {
  it("acepta códigos DANE y DIVIPOLA bien formados", () => {
    expect(esquemaCodigoDepartamento.parse(" 05 ")).toBe("05")
    expect(esquemaCodigoMunicipio.parse("05001")).toBe("05001")
  })

  it("rechaza códigos mal formados con mensajes en español", () => {
    for (const codigo of ["5", "005", "AN", "", "05;"]) {
      const resultado = esquemaCodigoDepartamento.safeParse(codigo)
      expect(resultado.success).toBe(false)
      expect(resultado.error?.issues[0]?.message).toBe(
        "Elige un departamento válido."
      )
    }
    expect(esquemaCodigoMunicipio.safeParse("0500").success).toBe(false)
    expect(
      esquemaCodigoDepartamento.safeParse(5).error?.issues[0]?.message
    ).toBe("Elige un departamento.")
  })

  it("normaliza la segmentación al validarla (cliente y servidor igual)", () => {
    expect(
      esquemaSegmentacion.parse({
        departamentos: ["05", "05"],
        municipios: ["05001", "52001"],
      })
    ).toEqual({ departamentos: ["05"], municipios: ["52001"] })
  })

  it("vacía es válida (todo el país)", () => {
    expect(
      esquemaSegmentacion.parse({ departamentos: [], municipios: [] })
    ).toEqual({ departamentos: [], municipios: [] })
  })

  it("rechaza listas desmesuradas", () => {
    const muchos = Array.from({ length: 34 }, () => "05")
    expect(
      esquemaSegmentacion.safeParse({ departamentos: muchos, municipios: [] })
        .success
    ).toBe(false)
  })
})
