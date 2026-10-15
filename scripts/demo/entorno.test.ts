import { describe, expect, it } from "vitest"

import { enParalelo, esSitioLocal } from "./entorno"

describe("esSitioLocal", () => {
  it("solo reconoce localhost y 127.0.0.1, con o sin puerto", () => {
    expect(esSitioLocal("http://localhost:3000")).toBe(true)
    expect(esSitioLocal("http://127.0.0.1")).toBe(true)
    expect(esSitioLocal("https://amo.example.co")).toBe(false)
    expect(esSitioLocal("http://localhost.example.co")).toBe(false)
    expect(esSitioLocal("http://localhost:3000/ruta")).toBe(false)
  })
})

describe("enParalelo", () => {
  it("procesa todos los elementos sin pasar del tope de trabajos simultáneos", async () => {
    const procesados: number[] = []
    let activos = 0
    let maximo = 0
    await enParalelo(
      [1, 2, 3, 4, 5, 6, 7],
      async (numero) => {
        activos += 1
        maximo = Math.max(maximo, activos)
        await Promise.resolve()
        procesados.push(numero)
        activos -= 1
      },
      3
    )
    expect(procesados.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(maximo).toBeLessThanOrEqual(3)
  })

  it("propaga el primer error", async () => {
    await expect(
      enParalelo([1, 2], async () => {
        throw new Error("falló")
      })
    ).rejects.toThrow("falló")
  })
})
