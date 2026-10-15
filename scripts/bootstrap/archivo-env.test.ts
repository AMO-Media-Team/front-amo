import { describe, expect, it } from "vitest"

import { agregarVariables, clavesDefinidas } from "./archivo-env"

describe("clavesDefinidas", () => {
  it("reconoce asignaciones, export y omite comentarios", () => {
    const contenido = "# A=1\nB=2\nexport C=3\n  D = 4\nsin_igual\n"
    expect([...clavesDefinidas(contenido)]).toEqual(["B", "C", "D"])
  })
})

describe("agregarVariables", () => {
  it("agrega al final solo las claves nuevas, sin tocar las existentes", () => {
    const original = "A=1\nE2E_X=antiguo\n"
    const { contenido, agregadas } = agregarVariables(
      original,
      { E2E_X: "nuevo", E2E_Y: "valor" },
      "Usuarios E2E"
    )
    expect(agregadas).toEqual(["E2E_Y"])
    expect(contenido).toBe(
      "A=1\nE2E_X=antiguo\n\n# Usuarios E2E\nE2E_Y=valor\n"
    )
    expect(contenido.startsWith(original)).toBe(true)
  })

  it("no cambia nada si todas existen", () => {
    const { contenido, agregadas } = agregarVariables("A=1", { A: "2" })
    expect(agregadas).toEqual([])
    expect(contenido).toBe("A=1")
  })

  it("separa del contenido previo aunque no termine en salto de línea", () => {
    expect(agregarVariables("A=1", { B: "2" }).contenido).toBe("A=1\n\nB=2\n")
    expect(agregarVariables("", { B: "2" }).contenido).toBe("B=2\n")
  })

  it("rechaza nombres o valores que romperían el archivo", () => {
    expect(() => agregarVariables("", { "mal-nombre": "x" })).toThrow()
    expect(() => agregarVariables("", { B: "con espacio" })).toThrow()
    expect(() => agregarVariables("", { B: 'comilla"' })).toThrow()
    expect(() => agregarVariables("", { B: "a#b" })).toThrow()
  })
})
