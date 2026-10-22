import { describe, expect, it, vi } from "vitest"

import { conVigencia } from "./memoria"

describe("conVigencia", () => {
  it("reutiliza el resultado mientras está vigente y recarga al vencer", async () => {
    let instante = 0
    const cargar = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
    const leer = conVigencia(cargar, 1000, () => instante)

    expect(await leer()).toBe(1)
    instante = 999
    expect(await leer()).toBe(1)
    expect(cargar).toHaveBeenCalledTimes(1)

    instante = 1000
    expect(await leer()).toBe(2)
    expect(cargar).toHaveBeenCalledTimes(2)
  })

  it("comparte una carga en curso entre visitas simultáneas", async () => {
    const cargar = vi.fn(async () => "datos")
    const leer = conVigencia(cargar, 1000, () => 0)
    const [a, b] = await Promise.all([leer(), leer()])
    expect(a).toBe("datos")
    expect(b).toBe("datos")
    expect(cargar).toHaveBeenCalledTimes(1)
  })

  it("no memoriza un fallo", async () => {
    const cargar = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("caída"))
      .mockResolvedValueOnce("bien")
    const leer = conVigencia(cargar, 1000, () => 0)

    await expect(leer()).rejects.toThrow("caída")
    expect(await leer()).toBe("bien")
    expect(cargar).toHaveBeenCalledTimes(2)
  })
})
