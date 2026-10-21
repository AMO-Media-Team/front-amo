import { describe, expect, it } from "vitest"

import {
  esquemaCambiosPreferencias,
  fusionarPreferencias,
  leerPreferencias,
  PREFERENCIAS_POR_DEFECTO,
} from "./preferencias"

describe("leerPreferencias", () => {
  it("usa los valores por defecto sin preferencias guardadas", () => {
    expect(leerPreferencias({})).toEqual(PREFERENCIAS_POR_DEFECTO)
    expect(leerPreferencias(null)).toEqual(PREFERENCIAS_POR_DEFECTO)
    expect(leerPreferencias([1, 2])).toEqual(PREFERENCIAS_POR_DEFECTO)
  })

  it("respeta las válidas e ignora las desconocidas o corruptas", () => {
    expect(
      leerPreferencias({
        tema: "light",
        densidad: "enorme",
        movimiento: "reducido",
        formatoNumeros: 7,
        otroModulo: { avisos: true },
      })
    ).toEqual({
      tema: "light",
      densidad: "normal",
      movimiento: "reducido",
      formatoNumeros: "colombia",
    })
  })
})

describe("fusionarPreferencias", () => {
  it("conserva las claves de otros módulos", () => {
    expect(
      fusionarPreferencias(
        { tema: "dark", otroModulo: { avisos: true } },
        { tema: "system" }
      )
    ).toEqual({ tema: "system", otroModulo: { avisos: true } })
  })

  it("parte de un objeto vacío si lo guardado no es un objeto", () => {
    expect(fusionarPreferencias("x", { densidad: "compacta" })).toEqual({
      densidad: "compacta",
    })
  })
})

describe("esquemaCambiosPreferencias", () => {
  it("acepta cambios parciales válidos", () => {
    expect(
      esquemaCambiosPreferencias.safeParse({ formatoNumeros: "internacional" })
        .success
    ).toBe(true)
  })

  it("rechaza valores fuera de catálogo, claves extra y cambios vacíos", () => {
    expect(esquemaCambiosPreferencias.safeParse({ tema: "rosa" }).success).toBe(
      false
    )
    expect(
      esquemaCambiosPreferencias.safeParse({ tema: "dark", admin: true })
        .success
    ).toBe(false)
    expect(esquemaCambiosPreferencias.safeParse({}).success).toBe(false)
  })
})
