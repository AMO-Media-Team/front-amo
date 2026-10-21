import { describe, expect, it } from "vitest"

import { normalizarNombreGeo } from "./normalizar"

describe("normalizarNombreGeo", () => {
  it.each([
    ["NARI¥O", "narino"],
    ["Nariño", "narino"],
    ["El Peñol", "el penol"],
    ["el penol", "el penol"],
    ["MIRITÍ - PARANÁ", "miriti parana"],
    ["  San   José  de Cúcuta ", "san jose de cucuta"],
    ["Côte d’Ivoire", "cote divoire"],
    ["Cote d'Ivoire", "cote divoire"],
    ["Trinidad & Tobago", "trinidad y tobago"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarNombreGeo(entrada)).toBe(esperado)
  })

  it("quita D.C. y Distrito Capital en cualquier forma", () => {
    for (const variante of [
      "Bogotá, D.C.",
      "bogota d.c.",
      "BOGOTÁ D. C.",
      "Bogotá DC",
      "Bogotá, Distrito Capital",
    ]) {
      expect(normalizarNombreGeo(variante)).toBe("bogota")
    }
    expect(normalizarNombreGeo("SANTAFE DE BOGOTA D.C")).toBe(
      "santafe de bogota"
    )
  })

  it("no deja vacío un nombre que solo es el sufijo", () => {
    expect(normalizarNombreGeo("Distrito Capital")).toBe("distrito capital")
  })

  it("distingue abreviaturas con y sin espacio", () => {
    expect(normalizarNombreGeo("EE. UU.")).toBe("ee uu")
    expect(normalizarNombreGeo("EE.UU.")).toBe("eeuu")
  })

  it("quita el artículo inicial solo si se pide y queda texto", () => {
    expect(normalizarNombreGeo("La Guajira")).toBe("la guajira")
    expect(normalizarNombreGeo("La Guajira", { quitarArticulos: true })).toBe(
      "guajira"
    )
    expect(normalizarNombreGeo("Los Patios", { quitarArticulos: true })).toBe(
      "patios"
    )
    expect(normalizarNombreGeo("La", { quitarArticulos: true })).toBe("la")
  })
})
