import { describe, expect, it } from "vitest"

import { interpretarPreferencias, type PreferenciasTabla } from "./preferencias"

const POR_DEFECTO: PreferenciasTabla = {
  densidad: "normal",
  visibilidad: { creado: false },
}

describe("interpretarPreferencias", () => {
  it("sin nada guardado usa los valores por defecto", () => {
    expect(interpretarPreferencias(null, POR_DEFECTO)).toBe(POR_DEFECTO)
  })

  it("combina la visibilidad guardada con la de por defecto", () => {
    const guardado = JSON.stringify({
      densidad: "compacta",
      visibilidad: { email: false, creado: true },
    })
    expect(interpretarPreferencias(guardado, POR_DEFECTO)).toEqual({
      densidad: "compacta",
      visibilidad: { email: false, creado: true },
    })
  })

  it("ignora valores corruptos o de otra versión", () => {
    for (const crudo of [
      "{no es json",
      "42",
      JSON.stringify({ densidad: "enorme", visibilidad: ["email"] }),
      JSON.stringify({ visibilidad: { email: "no" } }),
    ]) {
      expect(interpretarPreferencias(crudo, POR_DEFECTO)).toEqual(POR_DEFECTO)
    }
  })
})
