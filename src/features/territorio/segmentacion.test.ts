import { describe, expect, it } from "vitest"

import {
  alternarDepartamento,
  alternarMunicipio,
  departamentoDeMunicipio,
  departamentosConMunicipios,
  esSegmentacionVacia,
  municipioIncluido,
  municipiosElegidosDe,
  normalizarSegmentacion,
  quitarDepartamento,
  quitarMunicipio,
  resumenSegmentacion,
  SEGMENTACION_VACIA,
} from "./segmentacion"

const MEDELLIN = "05001"
const ENVIGADO = "05266"
const BARRANQUILLA = "08001"
const PASTO = "52001"

describe("normalizarSegmentacion", () => {
  it("quita repetidos y municipios cubiertos por su departamento completo", () => {
    expect(
      normalizarSegmentacion({
        departamentos: ["05", "05", " 08 "],
        municipios: [MEDELLIN, PASTO, PASTO, BARRANQUILLA],
      })
    ).toEqual({ departamentos: ["05", "08"], municipios: [PASTO] })
  })

  it("conserva el orden en que se eligió", () => {
    expect(
      normalizarSegmentacion({
        departamentos: [],
        municipios: [PASTO, MEDELLIN],
      }).municipios
    ).toEqual([PASTO, MEDELLIN])
  })
})

describe("alternar", () => {
  it("marcar un departamento absorbe sus municipios; desmarcarlo no los devuelve", () => {
    const conMunicipios = {
      departamentos: [],
      municipios: [MEDELLIN, ENVIGADO, PASTO],
    }
    const conAntioquia = alternarDepartamento(conMunicipios, "05")
    expect(conAntioquia).toEqual({ departamentos: ["05"], municipios: [PASTO] })
    expect(alternarDepartamento(conAntioquia, "05")).toEqual({
      departamentos: [],
      municipios: [PASTO],
    })
  })

  it("marca y desmarca municipios sueltos", () => {
    const uno = alternarMunicipio(SEGMENTACION_VACIA, MEDELLIN)
    expect(uno.municipios).toEqual([MEDELLIN])
    expect(alternarMunicipio(uno, MEDELLIN).municipios).toEqual([])
  })

  it("un municipio de un departamento completo no se agrega aparte", () => {
    const conAntioquia = { departamentos: ["05"], municipios: [] }
    expect(alternarMunicipio(conAntioquia, ENVIGADO)).toBe(conAntioquia)
  })

  it("quitar una ficha solo quita esa", () => {
    const valor = { departamentos: ["08", "52"], municipios: [MEDELLIN] }
    expect(quitarDepartamento(valor, "08")).toEqual({
      departamentos: ["52"],
      municipios: [MEDELLIN],
    })
    expect(quitarMunicipio(valor, MEDELLIN).municipios).toEqual([])
  })
})

describe("consultas sobre la segmentación", () => {
  const valor = { departamentos: ["08"], municipios: [MEDELLIN, ENVIGADO] }

  it("el departamento sale de los dos primeros dígitos DIVIPOLA", () => {
    expect(departamentoDeMunicipio(PASTO)).toBe("52")
  })

  it("un municipio está incluido si se eligió o si su departamento está completo", () => {
    expect(municipioIncluido(valor, MEDELLIN)).toBe(true)
    expect(municipioIncluido(valor, BARRANQUILLA)).toBe(true)
    expect(municipioIncluido(valor, PASTO)).toBe(false)
  })

  it("agrupa los municipios elegidos por departamento", () => {
    expect(municipiosElegidosDe(valor, "05")).toEqual([MEDELLIN, ENVIGADO])
    expect(departamentosConMunicipios(valor)).toEqual(["05"])
  })

  it("vacía significa todo el país", () => {
    expect(esSegmentacionVacia(SEGMENTACION_VACIA)).toBe(true)
    expect(resumenSegmentacion(SEGMENTACION_VACIA)).toBe("Todo el país")
    expect(resumenSegmentacion(SEGMENTACION_VACIA, "Sin restricción")).toBe(
      "Sin restricción"
    )
  })

  it("resume en lenguaje claro con singular y plural", () => {
    expect(resumenSegmentacion({ departamentos: ["08"], municipios: [] })).toBe(
      "1 departamento completo"
    )
    expect(resumenSegmentacion(valor)).toBe(
      "1 departamento completo y 2 municipios"
    )
    expect(
      resumenSegmentacion({ departamentos: ["05", "08"], municipios: [PASTO] })
    ).toBe("2 departamentos completos y 1 municipio")
  })
})
