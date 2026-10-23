import { describe, expect, it } from "vitest"

import {
  esquemaAsignacion,
  esquemaDesistir,
  esquemaFirmarArchivo,
} from "./schemas"

const ID = "0199f3a0-0000-7000-8000-00000000a501"
const ARCHIVO = "0199f3a0-0000-7000-8000-0000000000a1"

describe("esquemas de Mis campañas", () => {
  it("exigen identificadores válidos", () => {
    expect(esquemaAsignacion.safeParse({ asignacionId: ID }).success).toBe(true)
    expect(esquemaAsignacion.safeParse({ asignacionId: "123" }).success).toBe(
      false
    )
    expect(
      esquemaFirmarArchivo.safeParse({ asignacionId: ID, archivoId: ARCHIVO })
        .success
    ).toBe(true)
    expect(
      esquemaFirmarArchivo.safeParse({
        asignacionId: ID,
        archivoId: ARCHIVO,
        descargar: true,
      }).success
    ).toBe(true)
    expect(
      esquemaFirmarArchivo.safeParse({ asignacionId: ID, archivoId: "x" })
        .success
    ).toBe(false)
  })

  it("desistir pide un motivo con sentido (5 a 500 caracteres)", () => {
    const corto = esquemaDesistir.safeParse({
      asignacionId: ID,
      motivo: "  no  ",
    })
    expect(corto.success).toBe(false)
    expect(corto.error?.issues[0]?.message).toBe(
      "Cuéntanos por qué desistes (al menos 5 caracteres)."
    )
    expect(
      esquemaDesistir.safeParse({ asignacionId: ID, motivo: "x".repeat(501) })
        .success
    ).toBe(false)
    const valido = esquemaDesistir.safeParse({
      asignacionId: ID,
      motivo: "  Ya no tengo espacio.  ",
    })
    expect(valido.data?.motivo).toBe("Ya no tengo espacio.")
  })
})
