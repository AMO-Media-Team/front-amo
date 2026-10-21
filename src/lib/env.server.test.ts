import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const CLAVE = `k1:${Buffer.alloc(32, 3).toString("base64")}`

describe("getEnvServidor", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("AMO_CIFRADO_KEY", CLAVE)
    vi.stubEnv("AMO_SERVIDOR_SECRET", "x".repeat(40))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("valida una sola vez y reutiliza el resultado", async () => {
    const { getEnvServidor } = await import("./env.server")
    const primero = getEnvServidor()
    vi.stubEnv("AMO_SERVIDOR_SECRET", "")
    expect(getEnvServidor()).toBe(primero)
  })

  it("falla con un error descriptivo si falta un secreto", async () => {
    vi.stubEnv("AMO_CIFRADO_KEY", "")
    const { getEnvServidor } = await import("./env.server")
    expect(() => getEnvServidor()).toThrow(/AMO_CIFRADO_KEY/)
  })
})
