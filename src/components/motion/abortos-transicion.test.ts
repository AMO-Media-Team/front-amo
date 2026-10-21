import { describe, expect, it } from "vitest"

import {
  esAbortoDeTransicion,
  ignorarAbortoDeTransicion,
} from "./abortos-transicion"

const VIEWPORT = new DOMException(
  "Transition was aborted because of invalid state: Viewport size changed",
  "InvalidStateError"
)

describe("esAbortoDeTransicion", () => {
  it.each([
    VIEWPORT,
    new DOMException(
      "Transition was aborted because of invalid state. Viewport size changed",
      "InvalidStateError"
    ),
    new DOMException(
      "Skipping view transition because viewport size changed.",
      "InvalidStateError"
    ),
    new DOMException(
      "View transition was skipped because document visibility state is hidden.",
      "InvalidStateError"
    ),
    new DOMException("Transition was skipped", "AbortError"),
  ])("reconoce el descarte del navegador: %s", (razon) => {
    expect(esAbortoDeTransicion(razon)).toBe(true)
  })

  it.each([
    [
      "un fetch cancelado",
      new DOMException("The user aborted a request.", "AbortError"),
    ],
    [
      "otro estado inválido",
      new DOMException(
        "The object is in an invalid state.",
        "InvalidStateError"
      ),
    ],
    [
      "el DOM tardó demasiado",
      new DOMException(
        "Transition was aborted because of timeout in DOM update",
        "TimeoutError"
      ),
    ],
    ["un error de la actualización", new Error("transition falló al pintar")],
    ["un texto", "Transition was skipped"],
    ["nada", undefined],
    ["nulo", null],
  ])("no confunde %s", (_caso, razon) => {
    expect(esAbortoDeTransicion(razon)).toBe(false)
  })
})

describe("ignorarAbortoDeTransicion", () => {
  it("deja pasar el aborto y relanza lo demás", () => {
    expect(() => ignorarAbortoDeTransicion(VIEWPORT)).not.toThrow()
    const fallo = new Error("no se pudo aplicar el tema")
    expect(() => ignorarAbortoDeTransicion(fallo)).toThrow(fallo)
  })
})
