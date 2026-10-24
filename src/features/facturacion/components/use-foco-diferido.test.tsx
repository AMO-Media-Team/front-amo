import { act, render, renderHook, screen } from "@testing-library/react"
import { useTransition } from "react"
import { describe, expect, it, vi } from "vitest"

import { useFocoDiferido } from "./use-foco-diferido"

describe("useFocoDiferido", () => {
  it("espera a que termine la transición para enfocar", () => {
    const enfocar = vi.fn()
    const { result, rerender } = renderHook(
      ({ pendiente }) => useFocoDiferido(pendiente),
      { initialProps: { pendiente: true } }
    )

    act(() => result.current(enfocar))
    expect(enfocar).not.toHaveBeenCalled()

    rerender({ pendiente: false })
    expect(enfocar).toHaveBeenCalledOnce()

    // Ya aplicado: otro render no lo repite.
    rerender({ pendiente: false })
    expect(enfocar).toHaveBeenCalledOnce()
  })

  it("sin transición en curso enfoca en cuanto se pide; gana el último pedido", () => {
    const primero = vi.fn()
    const segundo = vi.fn()
    const { result } = renderHook(() => useFocoDiferido(false))

    act(() => {
      result.current(primero)
      result.current(segundo)
    })
    expect(primero).not.toHaveBeenCalled()
    expect(segundo).toHaveBeenCalledOnce()
  })

  it("enfoca un campo deshabilitado durante la transición cuando vuelve a habilitarse", async () => {
    let terminar: () => void = () => undefined
    function Formulario() {
      const [pendiente, iniciar] = useTransition()
      const diferir = useFocoDiferido(pendiente)
      return (
        <>
          <label htmlFor="monto">Monto</label>
          <input id="monto" disabled={pendiente} />
          <button
            type="button"
            onClick={() =>
              iniciar(async () => {
                await new Promise<void>((resolver) => {
                  terminar = resolver
                })
                diferir(() => document.getElementById("monto")?.focus())
              })
            }
          >
            Enviar
          </button>
        </>
      )
    }

    render(<Formulario />)
    const boton = screen.getByRole("button", { name: "Enviar" })
    boton.focus()
    act(() => boton.click())
    expect(screen.getByLabelText("Monto")).toBeDisabled()

    await act(async () => terminar())
    const monto = screen.getByLabelText("Monto")
    expect(monto).toBeEnabled()
    expect(monto).toHaveFocus()
  })
})
