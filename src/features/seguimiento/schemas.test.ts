import { describe, expect, it } from "vitest"

import {
  esquemaConsultaSeguimiento,
  esquemaFirmaCaptura,
  esquemaPerfilMedio,
} from "./schemas"

const ID = "0199f3a0-0000-7000-8000-00000000ca01"

describe("esquemas del seguimiento", () => {
  it("la consulta exige el id de la campaña", () => {
    expect(
      esquemaConsultaSeguimiento.safeParse({ campanaId: ID }).success
    ).toBe(true)
    const malo = esquemaConsultaSeguimiento.safeParse({ campanaId: "abc" })
    expect(malo.success).toBe(false)
    expect(malo.error?.issues[0].message).toBe("La campaña no es válida.")
  })

  it("la firma pide el original por defecto y nunca recibe una ruta", () => {
    expect(esquemaFirmaCaptura.parse({ publicacionId: ID })).toEqual({
      publicacionId: ID,
      variante: "original",
      descargar: false,
    })
    expect(
      esquemaFirmaCaptura.parse({
        publicacionId: ID,
        variante: "miniatura",
        ruta: "asignacion/otra/x.webp",
      })
    ).not.toHaveProperty("ruta")
    expect(
      esquemaFirmaCaptura.safeParse({ publicacionId: ID, variante: "grande" })
        .success
    ).toBe(false)
  })

  it("el perfil exige el id del medio", () => {
    expect(esquemaPerfilMedio.safeParse({ medioId: ID }).success).toBe(true)
    expect(esquemaPerfilMedio.safeParse({ medioId: "" }).success).toBe(false)
  })
})
