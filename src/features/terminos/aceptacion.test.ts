import { describe, expect, it } from "vitest"

import { revisarAceptacion } from "./aceptacion"

const A = "0192f3a4-5b6c-7d8e-9f01-00000000000a"
const B = "0192f3a4-5b6c-7d8e-9f01-00000000000b"
const C = "0192f3a4-5b6c-7d8e-9f01-00000000000c"

describe("revisarAceptacion", () => {
  it("con todo lo pendiente mostrado y marcado, registra lo pendiente", () => {
    expect(
      revisarAceptacion({
        pendientes: [A, B],
        mostradas: [A, B],
        aceptadas: [B, A],
      })
    ).toEqual({ tipo: "completa", versiones: [A, B] })
  })

  it("ignora versiones marcadas que ya no están pendientes", () => {
    // C se aceptó en otra pestaña o fue reemplazada: no se vuelve a insertar.
    expect(
      revisarAceptacion({
        pendientes: [A],
        mostradas: [A, C],
        aceptadas: [A, C],
      })
    ).toEqual({ tipo: "completa", versiones: [A] })
  })

  it("una pendiente mostrada sin marcar deja la aceptación incompleta", () => {
    expect(
      revisarAceptacion({
        pendientes: [A, B, C],
        mostradas: [A, B, C],
        aceptadas: [B],
      })
    ).toEqual({ tipo: "incompleta", faltan: [A, C] })
  })

  it("una versión publicada después de abrir la pantalla obliga a mostrarla", () => {
    expect(
      revisarAceptacion({
        pendientes: [A, C],
        mostradas: [A, B],
        aceptadas: [A, B],
      })
    ).toEqual({ tipo: "desactualizada" })
  })

  it("lo desactualizado prevalece sobre lo incompleto", () => {
    expect(
      revisarAceptacion({ pendientes: [A, C], mostradas: [A], aceptadas: [] })
    ).toEqual({ tipo: "desactualizada" })
  })
})
