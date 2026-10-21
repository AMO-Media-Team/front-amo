import { describe, expect, it } from "vitest"

import {
  agregarPorGeometria,
  buscarMunicipiosPorNombre,
  codigoMunicipioCanonico,
  resolverDepartamento,
  resolverMunicipio,
  resolverPais,
} from "./resolver"

describe("resolverPais", () => {
  it.each([
    ["EE. UU.", "US"],
    ["EEUU", "US"],
    ["USA", "US"],
    ["Estados Unidos de América", "US"],
    ["estados unidos", "US"],
    ["Reino Unido", "GB"],
    ["Inglaterra", "GB"],
    ["UK", "GB"],
    ["Holanda", "NL"],
    ["Países Bajos", "NL"],
    ["Corea del Sur", "KR"],
    ["República Checa", "CZ"],
    ["Costa de Marfil", "CI"],
    ["Colombia", "CO"],
    ["co", "CO"],
    ["COL", "CO"],
    ["170", "CO"],
    ["Brazil", "BR"],
    ["Kosovo", "XK"],
    ["KOS", "XK"],
    ["SDS", "SS"],
    ["Taiwan", "TW"],
    ["Malvinas", "FK"],
    ["Nueva Zelandia", "NZ"],
    ["GUF", "GF"],
  ])("%s → %s", (entrada, iso2) => {
    expect(resolverPais(entrada)?.iso2).toBe(iso2)
  })

  it("no adivina con nombres que designan a más de un territorio", () => {
    expect(resolverPais("Islas Vírgenes")).toBeNull()
    expect(resolverPais("Guayana")).toBeNull()
  })

  it("devuelve null para lo desconocido o vacío", () => {
    expect(resolverPais("Narnia")).toBeNull()
    expect(resolverPais("")).toBeNull()
    expect(resolverPais("ZZ")).toBeNull()
  })
})

describe("resolverDepartamento", () => {
  it.each([
    ["Bogotá", "11"],
    ["bogota d.c.", "11"],
    ["SANTAFE DE BOGOTA D.C", "11"],
    ["Bogotá, Distrito Capital", "11"],
    ["San Andrés", "88"],
    ["San Andrés y Providencia", "88"],
    ["NARI¥O", "52"],
    ["Nariño", "52"],
    ["Guajira", "44"],
    ["Valle", "76"],
    ["N. de Santander", "54"],
    ["5", "05"],
    ["05", "05"],
    ["CO-ANT", "05"],
    ["DC", "11"],
    ["sap", "88"],
  ])("%s → %s", (entrada, codigo) => {
    expect(resolverDepartamento(entrada)?.codigo).toBe(codigo)
  })

  it("acepta el código como número", () => {
    expect(resolverDepartamento(8)?.nombre).toBe("Atlántico")
  })

  it("devuelve null si no existe", () => {
    expect(resolverDepartamento("12")).toBeNull()
    expect(resolverDepartamento("Atlántida")).toBeNull()
  })
})

describe("resolverMunicipio", () => {
  it("resuelve códigos con y sin cero inicial y códigos históricos", () => {
    expect(resolverMunicipio("05001")?.nombre).toBe("Medellín")
    expect(resolverMunicipio(5001)?.nombre).toBe("Medellín")
    expect(resolverMunicipio("27086")?.codigo).toBe("27493")
    expect(resolverMunicipio("99999")).toBeNull()
  })

  it("resuelve nombres únicos y alias", () => {
    expect(resolverMunicipio("Medellín")?.codigo).toBe("05001")
    expect(resolverMunicipio("Cúcuta")?.codigo).toBe("54001")
    expect(resolverMunicipio("Barranco Minas")?.codigo).toBe("94343")
    expect(resolverMunicipio("bogota d.c.")?.codigo).toBe("11001")
    expect(resolverMunicipio("Villa de Leiva")?.codigo).toBe("15407")
    expect(resolverMunicipio("Puerto Inírida")?.codigo).toBe("94001")
    expect(resolverMunicipio("San Juan de Pasto")?.codigo).toBe("52001")
  })

  it("desambigua El Peñol con el departamento", () => {
    expect(
      resolverMunicipio({ departamento: "Antioquia", nombre: "El Peñol" })
        ?.codigo
    ).toBe("05541")
    expect(
      resolverMunicipio({ departamento: "Nariño", nombre: "el penol" })?.codigo
    ).toBe("52254")
    expect(
      buscarMunicipiosPorNombre("Peñol")
        .map((m) => m.codigo)
        .sort()
    ).toEqual(["05541", "52254"])
  })

  it("no adivina ante nombres repetidos sin departamento", () => {
    expect(resolverMunicipio("San Andrés")).toBeNull()
    expect(
      resolverMunicipio({ departamento: "San Andrés", nombre: "San Andrés" })
        ?.codigo
    ).toBe("88001")
  })

  it("normaliza códigos canónicos", () => {
    expect(codigoMunicipioCanonico(8001)).toBe("08001")
    expect(codigoMunicipioCanonico("94663")).toBe("94343")
    expect(codigoMunicipioCanonico("123")).toBeNull()
  })
})

describe("agregarPorGeometria", () => {
  it("suma en el polígono que representa a cada municipio", () => {
    const { valores, sinResolver } = agregarPorGeometria({
      "13600": 10,
      "13490": 5, // Norosí se dibuja con Río Viejo.
      "5001": 7,
      "27086": 2, // Código histórico de Nuevo Belén de Bajirá.
      "00000": 1,
    })
    expect(valores).toEqual({ "13600": 15, "05001": 7, "27493": 2 })
    expect(sinResolver).toEqual(["00000"])
  })

  it("promedia tasas ponderando por el peso de cada municipio", () => {
    const { valores } = agregarPorGeometria(
      { "13600": 0.2, "13490": 0.5 },
      { modo: "promedio", pesos: { "13600": 3000, "13490": 1000 } }
    )
    expect(valores["13600"]).toBeCloseTo((0.2 * 3000 + 0.5 * 1000) / 4000)
  })

  it("sin pesos promedia simple y descarta pesos nulos", () => {
    expect(
      agregarPorGeometria({ "13600": 2, "13490": 4 }, { modo: "promedio" })
        .valores
    ).toEqual({ "13600": 3 })
    expect(
      agregarPorGeometria(
        { "13600": 2, "13490": 4 },
        { modo: "promedio", pesos: { "13600": 0 } }
      ).valores
    ).toEqual({})
  })

  it("ignora valores no finitos", () => {
    expect(agregarPorGeometria({ "05001": Number.NaN }).valores).toEqual({})
  })
})
