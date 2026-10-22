// @vitest-environment node
import { createHash } from "node:crypto"

import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { coincideCodigo } = await import("./huella-codigo")

function huella(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex")
}

describe("coincideCodigo", () => {
  it("acepta el código como se escribió, en minúsculas o con separadores", () => {
    const guardada = huella("AB3K9P")
    expect(coincideCodigo("AB3K9P", guardada)).toBe(true)
    expect(coincideCodigo("ab3k9p", guardada)).toBe(true)
    expect(coincideCodigo(" AB3-K9P ", guardada)).toBe(true)
  })

  it("respeta un código guardado con su guion", () => {
    expect(coincideCodigo("ab3-k9p", huella("AB3-K9P"))).toBe(true)
  })

  it("rechaza otro código o una huella inválida", () => {
    expect(coincideCodigo("AB3K9Q", huella("AB3K9P"))).toBe(false)
    expect(coincideCodigo("AB3K9P", "no-es-hex")).toBe(false)
    expect(coincideCodigo("", huella(""))).toBe(false)
  })
})
