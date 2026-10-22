// @vitest-environment node
import { createHash } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  ALFABETO_CODIGO,
  codigoCoincide,
  type FuenteAleatoria,
  generarCodigo,
  huellaCodigo,
  LARGO_CODIGO,
  normalizarCodigo,
  vencimientoCodigo,
} from "./codigo"

/** Fuente que entrega los bytes indicados, uno por uno y en ciclo. */
function bytesFijos(bytes: readonly number[]): FuenteAleatoria {
  let indice = 0
  return (cantidad) =>
    Uint8Array.from({ length: cantidad }, () => bytes[indice++ % bytes.length])
}

describe("generarCodigo", () => {
  it("produce códigos del largo fijado, solo con el alfabeto legible", () => {
    for (let vez = 0; vez < 200; vez++) {
      const codigo = generarCodigo()
      expect(codigo).toHaveLength(LARGO_CODIGO)
      for (const caracter of codigo) {
        expect(ALFABETO_CODIGO).toContain(caracter)
      }
    }
  })

  it("el alfabeto no tiene caracteres que se confunden al copiarlos", () => {
    for (const confuso of ["0", "O", "1", "I", "L"]) {
      expect(ALFABETO_CODIGO).not.toContain(confuso)
    }
    expect(LARGO_CODIGO).toBeGreaterThanOrEqual(6)
    expect(LARGO_CODIGO).toBeLessThanOrEqual(8)
  })

  it("descarta los bytes que sesgarían el módulo", () => {
    const limite =
      Math.floor(256 / ALFABETO_CODIGO.length) * ALFABETO_CODIGO.length
    // 255 queda por encima del límite y se ignora; 0..5 dan las primeras letras.
    const codigo = generarCodigo(bytesFijos([255, 0, 255, 1, 2, 3, 4, 5]))
    expect(limite).toBeLessThan(256)
    expect(codigo).toBe(ALFABETO_CODIGO.slice(0, 6))
  })

  it("sigue pidiendo bytes hasta completar el código", () => {
    const codigo = generarCodigo(bytesFijos([255, 255, 255, 7]))
    expect(codigo).toBe(ALFABETO_CODIGO[7].repeat(LARGO_CODIGO))
  })
})

describe("normalizarCodigo y huellaCodigo", () => {
  it("ignora mayúsculas, espacios, guiones, puntos y guiones bajos", () => {
    expect(normalizarCodigo(" k7p 4-x.q_ ")).toBe("K7P4XQ")
  })

  it("guarda el sha256 en hex de la forma normalizada", () => {
    const esperado = createHash("sha256").update("K7P4XQ").digest("hex")
    expect(huellaCodigo("k7p 4xq")).toBe(esperado)
    expect(huellaCodigo("K7P4XQ")).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("codigoCoincide", () => {
  const huella = huellaCodigo("K7P4XQ")

  it("acepta lo que se lee en la captura aunque se escriba distinto", () => {
    expect(codigoCoincide("k7p 4xq", huella)).toBe(true)
    expect(codigoCoincide("K7P-4XQ", huella)).toBe(true)
  })

  it("rechaza otro código y huellas mal formadas", () => {
    expect(codigoCoincide("K7P4XR", huella)).toBe(false)
    expect(codigoCoincide("K7P4XQ", "no-es-hex")).toBe(false)
    expect(codigoCoincide("K7P4XQ", huella.toUpperCase())).toBe(false)
  })
})

describe("vencimientoCodigo", () => {
  it("suma los minutos configurados", () => {
    const ahora = new Date("2026-10-22T15:00:00Z")
    expect(vencimientoCodigo(ahora, 60).toISOString()).toBe(
      "2026-10-22T16:00:00.000Z"
    )
  })
})
