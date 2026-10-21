import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"

import { exito, fallo, type ResultadoAccion } from "@/lib/result"

import { MENSAJE_SIN_RESPUESTA, useEnvio } from "./use-envio"

interface Valores {
  nombre: string
}

function Formulario({
  accion,
  onExito,
}: {
  accion: (valores: Valores) => Promise<ResultadoAccion<{ id: string }>>
  onExito: (datos: { id: string }) => void
}) {
  const formulario = useForm<Valores>({ defaultValues: { nombre: "Reel" } })
  const { enviar, errorGeneral } = useEnvio({
    formulario,
    accion,
    campos: ["nombre"],
    onExito,
  })
  const errorNombre = formulario.formState.errors.nombre?.message
  return (
    <form onSubmit={enviar} noValidate>
      <label>
        Nombre
        <input {...formulario.register("nombre")} />
      </label>
      {errorNombre ? <p>{errorNombre}</p> : null}
      {errorGeneral ? <p role="alert">{errorGeneral}</p> : null}
      <button type="submit">Guardar</button>
    </form>
  )
}

describe("useEnvio", () => {
  it("envía los valores tal como se escribieron y avisa del éxito", async () => {
    const accion = vi.fn().mockResolvedValue(exito({ id: "1" }))
    const onExito = vi.fn()
    render(<Formulario accion={accion} onExito={onExito} />)

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(onExito).toHaveBeenCalledWith({ id: "1" }))
    expect(accion).toHaveBeenCalledWith({ nombre: "Reel" })
  })

  it("lleva el error del servidor a su campo", async () => {
    const accion = vi
      .fn()
      .mockResolvedValue(
        fallo("Revisa los campos marcados.", { nombre: ["Ya existe."] })
      )
    const onExito = vi.fn()
    render(<Formulario accion={accion} onExito={onExito} />)

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }))

    expect(await screen.findByText("Ya existe.")).toBeInTheDocument()
    expect(onExito).not.toHaveBeenCalled()
  })

  it("si la acción lanza (sin red), muestra un error general y conserva lo escrito", async () => {
    const accion = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    const onExito = vi.fn()
    render(<Formulario accion={accion} onExito={onExito} />)

    await userEvent.click(screen.getByRole("button", { name: "Guardar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      MENSAJE_SIN_RESPUESTA
    )
    expect(screen.getByLabelText("Nombre")).toHaveValue("Reel")
    expect(onExito).not.toHaveBeenCalled()
  })
})
