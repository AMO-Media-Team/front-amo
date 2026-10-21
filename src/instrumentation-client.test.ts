import { afterEach, describe, expect, it, vi } from "vitest"
import { config } from "zod/v4/core"

describe("instrumentación del navegador", () => {
  afterEach(() => {
    config({ jitless: false })
    vi.unstubAllGlobals()
  })

  it("zod no prueba `new Function`: la CSP lo informaría como violación", async () => {
    const constructorFunciones = vi.fn(Function)
    vi.stubGlobal("Function", constructorFunciones)

    await import("./instrumentation-client")
    const { z } = await import("zod")
    const esquema = z.object({ nombre: z.string() })

    expect(config().jitless).toBe(true)
    expect(esquema.parse({ nombre: "AMO" })).toEqual({ nombre: "AMO" })
    expect(constructorFunciones).not.toHaveBeenCalled()
  })
})
