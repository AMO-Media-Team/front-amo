import { render } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { GuardiaTransiciones } from "./guardia-transiciones"

/** jsdom no trae `PromiseRejectionEvent`: basta un evento con `reason`. */
function rechazoSinCapturar(razon: unknown): Event {
  const evento = new Event("unhandledrejection", { cancelable: true })
  Object.defineProperty(evento, "reason", { value: razon })
  window.dispatchEvent(evento)
  return evento
}

/** Como `reportError(error)`: la vía por la que Next publica lo que React le entrega. */
function errorGlobal(error: unknown): Event {
  const evento = new ErrorEvent("error", { cancelable: true, error })
  window.dispatchEvent(evento)
  return evento
}

// El mensaje real de Chromium al girar el teléfono o plegarse su barra de
// direcciones a mitad de una navegación (React no lo reconoce como aborto).
const ABORTO = new DOMException(
  "Transition was aborted because of invalid state. Viewport size changed",
  "InvalidStateError"
)

// Sin ningún oyente de `error`, Vitest da por no capturado todo evento de
// error (y lo marca como atendido): con uno propio, lo observado es la guardia.
const oyentePropio = () => {}
beforeAll(() => window.addEventListener("error", oyentePropio))
afterAll(() => window.removeEventListener("error", oyentePropio))

describe("GuardiaTransiciones", () => {
  it("atiende el aborto de una transición y deja pasar los demás rechazos", () => {
    render(<GuardiaTransiciones />)
    expect(rechazoSinCapturar(ABORTO).defaultPrevented).toBe(true)
    expect(rechazoSinCapturar(new Error("otra cosa")).defaultPrevented).toBe(
      false
    )
  })

  it("atiende el aborto que React publica como error global, y solo ese", () => {
    render(<GuardiaTransiciones />)
    expect(errorGlobal(ABORTO).defaultPrevented).toBe(true)
    expect(errorGlobal(new Error("falló el render")).defaultPrevented).toBe(
      false
    )
    expect(errorGlobal(undefined).defaultPrevented).toBe(false)
  })

  it("deja de escuchar al desmontarse", () => {
    const { unmount } = render(<GuardiaTransiciones />)
    unmount()
    expect(rechazoSinCapturar(ABORTO).defaultPrevented).toBe(false)
    expect(errorGlobal(ABORTO).defaultPrevented).toBe(false)
  })
})
