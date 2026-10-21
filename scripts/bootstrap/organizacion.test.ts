import { describe, expect, it } from "vitest"

import {
  ANUNCIANTE_E2E_ID,
  ErrorOrganizacion,
  exigeTotp,
  organizacionDe,
} from "./organizacion"

const MEDIO = "01a10e25-2747-7f83-a554-575643ab26dc"

describe("organizacionDe", () => {
  it("los roles internos no pertenecen a ninguna organización", () => {
    for (const rol of ["SUPERADMIN", "ADMIN"] as const) {
      expect(organizacionDe({ rol, medioId: MEDIO })).toEqual({
        anunciante_id: null,
        medio_id: null,
      })
    }
  })

  it("el anunciante usa la organización E2E", () => {
    expect(organizacionDe({ rol: "ANUNCIANTE" })).toEqual({
      anunciante_id: ANUNCIANTE_E2E_ID,
      medio_id: null,
    })
  })

  it("el medio queda vinculado al medio indicado y a nada más", () => {
    expect(organizacionDe({ rol: "MEDIO", medioId: MEDIO })).toEqual({
      anunciante_id: null,
      medio_id: MEDIO,
    })
  })

  it("un medio sin su medio no se puede preparar", () => {
    expect(() => organizacionDe({ rol: "MEDIO" })).toThrow(ErrorOrganizacion)
    expect(() => organizacionDe({ rol: "MEDIO", medioId: null })).toThrow(
      /necesita el medio/
    )
  })
})

describe("exigeTotp", () => {
  it("solo los roles internos enrolan verificación en dos pasos", () => {
    expect(exigeTotp("SUPERADMIN")).toBe(true)
    expect(exigeTotp("ADMIN")).toBe(true)
    expect(exigeTotp("ANUNCIANTE")).toBe(false)
    expect(exigeTotp("MEDIO")).toBe(false)
  })
})
