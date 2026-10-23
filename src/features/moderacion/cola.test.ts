import { describe, expect, it } from "vitest"

import {
  cargarParametrosModeracion,
  paginaEfectiva,
  RUTA_MODERACION,
  rutaModeracion,
  TAMANO_PAGINA_MODERACION,
} from "./cola"

describe("cola de moderación en la URL", () => {
  it("la primera página no ocupa la URL", () => {
    expect(rutaModeracion()).toBe(RUTA_MODERACION)
    expect(rutaModeracion(1)).toBe(RUTA_MODERACION)
    expect(rutaModeracion(3)).toBe("/operacion/moderacion?pagina=3")
    expect(rutaModeracion(2.7)).toBe("/operacion/moderacion?pagina=2")
  })

  it("lee la página de los parámetros (1 por defecto)", async () => {
    expect(await cargarParametrosModeracion(new URLSearchParams())).toEqual({
      pagina: 1,
    })
    expect(
      await cargarParametrosModeracion(new URLSearchParams("pagina=4"))
    ).toEqual({ pagina: 4 })
    expect(
      await cargarParametrosModeracion(new URLSearchParams("pagina=abc"))
    ).toEqual({ pagina: 1 })
  })
})

describe("paginaEfectiva", () => {
  it("acota la página al total de ofertas", () => {
    const total = TAMANO_PAGINA_MODERACION * 2 + 1
    expect(paginaEfectiva(1, total)).toBe(1)
    expect(paginaEfectiva(3, total)).toBe(3)
    expect(paginaEfectiva(9, total)).toBe(3)
    expect(paginaEfectiva(0, total)).toBe(1)
    expect(paginaEfectiva(-4, total)).toBe(1)
  })

  it("sin ofertas o con una página inválida, la primera", () => {
    expect(paginaEfectiva(5, 0)).toBe(1)
    expect(paginaEfectiva(Number.NaN, 40)).toBe(1)
  })
})
