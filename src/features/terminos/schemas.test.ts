import { describe, expect, it } from "vitest"

import {
  CAMPOS_ACEPTACION,
  esquemaAceptacion,
  leerFormularioAceptacion,
} from "./schemas"

const A = "0192f3a4-5b6c-7d8e-9f01-00000000000a"
const B = "0192f3a4-5b6c-7d8e-9f01-00000000000b"

function formulario(campos: [string, string][]): FormData {
  const datos = new FormData()
  for (const [nombre, valor] of campos) datos.append(nombre, valor)
  return datos
}

describe("leerFormularioAceptacion", () => {
  it("lee los campos repetidos como listas y el destino", () => {
    expect(
      leerFormularioAceptacion(
        formulario([
          [CAMPOS_ACEPTACION.mostrada, A],
          [CAMPOS_ACEPTACION.mostrada, B],
          [CAMPOS_ACEPTACION.aceptada, B],
          [CAMPOS_ACEPTACION.siguiente, "/notificaciones"],
        ])
      )
    ).toEqual({
      aceptadas: [B],
      mostradas: [A, B],
      siguiente: "/notificaciones",
    })
  })

  it("sin casillas marcadas ni destino", () => {
    expect(
      leerFormularioAceptacion(
        formulario([
          [CAMPOS_ACEPTACION.mostrada, A],
          [CAMPOS_ACEPTACION.siguiente, ""],
        ])
      )
    ).toEqual({ aceptadas: [], mostradas: [A], siguiente: undefined })
  })

  it("descarta archivos enviados en lugar de texto", () => {
    const datos = formulario([[CAMPOS_ACEPTACION.mostrada, A]])
    datos.append(CAMPOS_ACEPTACION.aceptada, new Blob(["x"]), "x.txt")
    expect(leerFormularioAceptacion(datos).aceptadas).toEqual([])
  })
})

describe("esquemaAceptacion", () => {
  it("acepta identificadores de versión válidos", () => {
    expect(
      esquemaAceptacion.safeParse({ aceptadas: [A], mostradas: [A] }).success
    ).toBe(true)
  })

  it("rechaza identificadores manipulados con un mensaje claro", () => {
    const resultado = esquemaAceptacion.safeParse({
      aceptadas: ["1 or 1=1"],
      mostradas: [A],
    })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toBe(
      "No pudimos leer tu aceptación. Actualiza la página e intenta de nuevo."
    )
  })

  it("exige al menos un documento mostrado y limita la cantidad", () => {
    expect(
      esquemaAceptacion.safeParse({ aceptadas: [], mostradas: [] }).success
    ).toBe(false)
    expect(
      esquemaAceptacion.safeParse({
        aceptadas: [],
        mostradas: Array.from({ length: 9 }, () => A),
      }).success
    ).toBe(false)
  })

  it("limita la longitud del destino", () => {
    expect(
      esquemaAceptacion.safeParse({
        aceptadas: [],
        mostradas: [A],
        siguiente: `/${"x".repeat(2048)}`,
      }).success
    ).toBe(false)
  })
})
