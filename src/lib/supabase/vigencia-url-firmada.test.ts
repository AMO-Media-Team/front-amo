import { describe, expect, it } from "vitest"

import {
  segundosDeVigencia,
  VIGENCIA_URL_FIRMADA_POR_DEFECTO_S,
} from "./vigencia-url-firmada"

describe("segundosDeVigencia", () => {
  it("usa el valor configurado, llegue como número o como texto", () => {
    expect(segundosDeVigencia(600)).toBe(600)
    expect(segundosDeVigencia("120")).toBe(120)
    expect(segundosDeVigencia(30)).toBe(30)
    expect(segundosDeVigencia(3600)).toBe(3600)
  })

  it.each([undefined, null, "", "abc", 0, 29, 3601, 90.5, true, {}, []])(
    "cae al valor por defecto si no es un entero dentro del rango (%j)",
    (valor) => {
      expect(segundosDeVigencia(valor)).toBe(VIGENCIA_URL_FIRMADA_POR_DEFECTO_S)
    }
  )
})
