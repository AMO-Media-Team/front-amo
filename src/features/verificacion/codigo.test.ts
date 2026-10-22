import { describe, expect, it } from "vitest"

import { esHuellaHex, variantesCodigo } from "./codigo"

describe("variantesCodigo", () => {
  it("prueba la escritura original, en mayúsculas y sin separadores", () => {
    expect(variantesCodigo(" ab3-k9p ")).toEqual(["ab3-k9p", "AB3-K9P", "AB3K9P"])
  })

  it("no repite variantes iguales", () => {
    expect(variantesCodigo("AB3K9P")).toEqual(["AB3K9P"])
    expect(variantesCodigo("ab3k9p")).toEqual(["ab3k9p", "AB3K9P"])
  })

  it("quita espacios, guiones y puntos intermedios", () => {
    expect(variantesCodigo("AB3 K9P").at(-1)).toBe("AB3K9P")
    expect(variantesCodigo("AB3.K9P").at(-1)).toBe("AB3K9P")
  })

  it("un texto vacío no tiene variantes", () => {
    expect(variantesCodigo("   ")).toEqual([])
  })
})

describe("esHuellaHex", () => {
  it("solo hex de 64 en minúsculas", () => {
    expect(esHuellaHex("a".repeat(64))).toBe(true)
    expect(esHuellaHex("A".repeat(64))).toBe(false)
    expect(esHuellaHex("a".repeat(63))).toBe(false)
    expect(esHuellaHex(null)).toBe(false)
  })
})
