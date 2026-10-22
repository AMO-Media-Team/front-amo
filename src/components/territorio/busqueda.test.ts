import { describe, expect, it } from "vitest"

import { filtrarTerritorio } from "./busqueda"

const MUNICIPIOS = [
  { codigo: "05001", nombre: "Medellín" },
  { codigo: "05088", nombre: "Bello" },
  { codigo: "05266", nombre: "Envigado" },
  { codigo: "05360", nombre: "Itagüí" },
  { codigo: "05380", nombre: "La Estrella" },
  { codigo: "05631", nombre: "Sabaneta" },
  { codigo: "05615", nombre: "Rionegro" },
]
const nombres = (m: { nombre: string }) => [m.nombre]
const buscar = (texto: string) =>
  filtrarTerritorio(MUNICIPIOS, texto, nombres).map((m) => m.nombre)

describe("filtrarTerritorio", () => {
  it("sin texto devuelve todo en el orden recibido", () => {
    expect(buscar("  ")).toEqual(MUNICIPIOS.map((m) => m.nombre))
  })

  it("ignora tildes, diéresis y mayúsculas", () => {
    expect(buscar("medellin")).toEqual(["Medellín"])
    expect(buscar("ITAGUI")).toEqual(["Itagüí"])
  })

  it("primero lo que empieza por el texto, luego palabras y al final lo que lo contiene", () => {
    // «Envigado» empieza por «e»; en «La Estrella» empieza una palabra; el
    // resto solo la contiene (en el orden recibido) e «Itagüí» no la tiene.
    expect(buscar("e")).toEqual([
      "Envigado",
      "La Estrella",
      "Medellín",
      "Bello",
      "Sabaneta",
      "Rionegro",
    ])
    expect(buscar("ell")).toEqual(["Medellín", "Bello", "La Estrella"])
  })

  it("busca también por código", () => {
    expect(buscar("0526")).toEqual(["Envigado"])
    expect(buscar("05")).toHaveLength(MUNICIPIOS.length)
  })

  it("considera varios nombres por opción (corto y oficial)", () => {
    const departamentos = [
      { codigo: "11", nombreCorto: "Bogotá", nombre: "Bogotá, D.C." },
      {
        codigo: "88",
        nombreCorto: "San Andrés",
        nombre: "Archipiélago de San Andrés, Providencia y Santa Catalina",
      },
    ]
    const resultado = filtrarTerritorio(departamentos, "providencia", (d) => [
      d.nombreCorto,
      d.nombre,
    ])
    expect(resultado.map((d) => d.codigo)).toEqual(["88"])
  })
})
