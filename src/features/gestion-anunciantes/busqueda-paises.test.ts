import { describe, expect, it } from "vitest"

import { filtrarPaises } from "./busqueda-paises"

const PAISES = [
  { iso2: "BR", nombre: "Brasil" },
  { iso2: "CO", nombre: "Colombia" },
  { iso2: "CR", nombre: "Costa Rica" },
  { iso2: "US", nombre: "Estados Unidos" },
  { iso2: "PE", nombre: "Perú" },
  { iso2: "DO", nombre: "República Dominicana" },
]

const nombres = (texto: string) =>
  filtrarPaises(PAISES, texto).map((pais) => pais.nombre)

describe("filtrarPaises", () => {
  it("sin texto devuelve la lista completa", () => {
    expect(filtrarPaises(PAISES, "  ")).toBe(PAISES)
  })

  it("ignora tildes y mayúsculas", () => {
    expect(nombres("peru")).toEqual(["Perú"])
    expect(nombres("REPÚBLICA")).toEqual(["República Dominicana"])
  })

  it("pone primero los que empiezan por lo escrito", () => {
    expect(nombres("co")).toEqual(["Colombia", "Costa Rica"])
    expect(nombres("ica")).toEqual(["Costa Rica", "República Dominicana"])
  })

  it("encuentra por código ISO y lo pone de primero", () => {
    expect(nombres("us")).toEqual(["Estados Unidos"])
    expect(nombres("do")).toEqual(["República Dominicana", "Estados Unidos"])
  })

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(nombres("narnia")).toEqual([])
  })
})
