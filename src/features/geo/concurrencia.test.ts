import { describe, expect, it } from "vitest"

import { crearLimitador } from "./concurrencia"

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("crearLimitador", () => {
  it("respeta el límite de tareas en vuelo y entrega cada resultado a su llamada", async () => {
    const limitar = crearLimitador(2)
    let enVuelo = 0
    let maximo = 0
    const resultados = await Promise.all(
      [30, 5, 20, 1, 10, 2].map((ms, i) =>
        limitar(async () => {
          enVuelo++
          maximo = Math.max(maximo, enVuelo)
          await esperar(ms)
          enVuelo--
          return i * 10
        })
      )
    )
    expect(maximo).toBe(2)
    expect(resultados).toEqual([0, 10, 20, 30, 40, 50])
  })

  it("un fallo libera su turno y no detiene al resto", async () => {
    const limitar = crearLimitador(1)
    const resultados = await Promise.allSettled(
      ["a", "b", "c"].map((letra) =>
        limitar(async () => {
          if (letra === "b") throw new Error("falla b")
          return letra.toUpperCase()
        })
      )
    )
    expect(resultados[0]).toEqual({ status: "fulfilled", value: "A" })
    expect(resultados[1].status).toBe("rejected")
    expect(resultados[2]).toEqual({ status: "fulfilled", value: "C" })
  })

  it("un límite no válido se trata como 1", async () => {
    const limitar = crearLimitador(0)
    expect(await limitar(async () => "ok")).toBe("ok")
  })
})
