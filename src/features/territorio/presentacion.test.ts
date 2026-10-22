import { describe, expect, it } from "vitest"

import {
  aDepartamento,
  aMunicipio,
  ordenarDepartamentos,
  ordenarMunicipios,
} from "./presentacion"

describe("presentación del territorio", () => {
  it("convierte las filas de la BD a los tipos de la app", () => {
    expect(
      aDepartamento({
        codigo: "11",
        nombre: "Bogotá, D.C.",
        nombre_corto: "Bogotá",
        region: "Andina",
      })
    ).toEqual({
      codigo: "11",
      nombre: "Bogotá, D.C.",
      nombreCorto: "Bogotá",
      region: "Andina",
    })
    expect(
      aMunicipio({
        codigo: "05001",
        nombre: "Medellín",
        departamento_codigo: "05",
        es_capital: true,
      })
    ).toEqual({
      codigo: "05001",
      nombre: "Medellín",
      departamentoCodigo: "05",
      esCapital: true,
    })
  })

  it("ordena los departamentos por nombre corto con reglas del español", () => {
    const nombres = ordenarDepartamentos(
      ["Vichada", "Ñame", "Bogotá", "Atlántico", "Córdoba"].map(
        (nombreCorto, i) => ({
          codigo: String(i).padStart(2, "0"),
          nombre: nombreCorto,
          nombreCorto,
          region: "Andina",
        })
      )
    ).map((d) => d.nombreCorto)
    expect(nombres).toEqual([
      "Atlántico",
      "Bogotá",
      "Córdoba",
      "Ñame",
      "Vichada",
    ])
  })

  it("pone la capital primero y el resto en orden alfabético", () => {
    const municipios = ordenarMunicipios([
      {
        codigo: "05266",
        nombre: "Envigado",
        departamentoCodigo: "05",
        esCapital: false,
      },
      {
        codigo: "05002",
        nombre: "Abejorral",
        departamentoCodigo: "05",
        esCapital: false,
      },
      {
        codigo: "05001",
        nombre: "Medellín",
        departamentoCodigo: "05",
        esCapital: true,
      },
    ]).map((m) => m.nombre)
    expect(municipios).toEqual(["Medellín", "Abejorral", "Envigado"])
  })
})
