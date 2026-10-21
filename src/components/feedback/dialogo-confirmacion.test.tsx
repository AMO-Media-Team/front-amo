import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fallo } from "@/lib/result"

import { DialogoConfirmacion } from "./dialogo-confirmacion"

function renderizar(
  props: Partial<React.ComponentProps<typeof DialogoConfirmacion>> = {}
) {
  const onConfirmar = props.onConfirmar ?? vi.fn()
  const onAbiertoChange = vi.fn()
  render(
    <DialogoConfirmacion
      abierto
      onAbiertoChange={onAbiertoChange}
      titulo="Eliminar medio"
      descripcion="Esta acción no se puede deshacer."
      textoConfirmar="Eliminar"
      destructivo
      {...props}
      onConfirmar={onConfirmar}
    />
  )
  return { onConfirmar, onAbiertoChange }
}

describe("DialogoConfirmacion", () => {
  it("exige escribir el texto de verificación", async () => {
    const usuario = userEvent.setup()
    const { onConfirmar } = renderizar({ textoVerificacion: "ELIMINAR" })

    const boton = screen.getByRole("button", { name: "Eliminar" })
    expect(boton).toBeDisabled()

    await usuario.type(screen.getByLabelText(/para confirmar/), "eliminar")
    expect(boton).toBeDisabled()

    await usuario.clear(screen.getByLabelText(/para confirmar/))
    await usuario.type(screen.getByLabelText(/para confirmar/), "ELIMINAR")
    expect(boton).toBeEnabled()

    await usuario.click(boton)
    expect(onConfirmar).toHaveBeenCalledOnce()
  })

  it("se cierra cuando la acción termina bien", async () => {
    const usuario = userEvent.setup()
    const { onAbiertoChange } = renderizar({
      onConfirmar: vi.fn().mockResolvedValue({ ok: true, datos: null }),
    })

    await usuario.click(screen.getByRole("button", { name: "Eliminar" }))
    await waitFor(() => expect(onAbiertoChange).toHaveBeenCalledWith(false))
  })

  it("muestra el error de la acción y sigue abierto", async () => {
    const usuario = userEvent.setup()
    const { onAbiertoChange } = renderizar({
      onConfirmar: vi
        .fn()
        .mockResolvedValue(fallo("El medio tiene cupos activos.")),
    })

    await usuario.click(screen.getByRole("button", { name: "Eliminar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El medio tiene cupos activos."
    )
    expect(onAbiertoChange).not.toHaveBeenCalledWith(false)
  })

  it("informa errores inesperados sin cerrarse", async () => {
    const usuario = userEvent.setup()
    renderizar({ onConfirmar: vi.fn().mockRejectedValue(new Error("boom")) })

    await usuario.click(screen.getByRole("button", { name: "Eliminar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo completar la acción"
    )
  })
})
