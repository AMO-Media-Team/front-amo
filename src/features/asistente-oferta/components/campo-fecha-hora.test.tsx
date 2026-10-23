import { zodResolver } from "@hookform/resolvers/zod"
import { fireEvent, render, screen } from "@testing-library/react"
import { useEffect } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { CampoFechaHora } from "./campo-fecha-hora"

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const esquema = z.object({
  limite: z.string().min(1, "Elige el día y la hora límite para aceptar."),
})

/** Avisa cada valor del campo (como lo vería el resto del formulario). */
function Observador({ alCambiar }: { alCambiar: (valor: string) => void }) {
  const valor = useWatch<{ limite: string }>({ name: "limite" })
  useEffect(() => alCambiar(valor ?? ""), [valor, alCambiar])
  return null
}

function Prueba({
  inicial,
  alCambiar,
}: {
  inicial: string
  alCambiar: (valor: string) => void
}) {
  const formulario = useForm({
    resolver: zodResolver(esquema),
    defaultValues: { limite: inicial },
    mode: "onTouched",
  })
  return (
    <FormProvider {...formulario}>
      <Observador alCambiar={alCambiar} />
      <CampoFechaHora
        nombre="limite"
        etiqueta="Fecha límite para aceptar"
        descripcion="Hasta cuándo pueden tomar un cupo."
      />
      <button type="button" onClick={() => void formulario.trigger()}>
        Validar
      </button>
    </FormProvider>
  )
}

describe("CampoFechaHora", () => {
  it("muestra el día y la hora de Bogotá del valor guardado", () => {
    render(<Prueba inicial="2026-11-04T23:00:00.000Z" alCambiar={vi.fn()} />)
    const grupo = screen.getByRole("group", {
      name: "Fecha límite para aceptar",
    })
    expect(grupo).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Día 4 de nov/ })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Hora")).toHaveValue("18:00")
  })

  it("cambiar la hora cambia el instante; sin hora el valor queda vacío", () => {
    const alCambiar = vi.fn()
    render(<Prueba inicial="2026-11-04T23:00:00.000Z" alCambiar={alCambiar} />)
    const hora = screen.getByLabelText("Hora")
    fireEvent.change(hora, { target: { value: "09:30" } })
    expect(alCambiar).toHaveBeenLastCalledWith("2026-11-04T14:30:00.000Z")
    fireEvent.change(hora, { target: { value: "" } })
    expect(alCambiar).toHaveBeenLastCalledWith("")
    // Lo escrito a medias se conserva para completarlo.
    expect(
      screen.getByRole("button", { name: /Día 4 de nov/ })
    ).toBeInTheDocument()
  })

  it("asocia el error a sus controles y los marca inválidos", async () => {
    render(<Prueba inicial="" alCambiar={vi.fn()} />)
    expect(
      screen.getByRole("button", { name: /Día Elige el día/ })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Validar" }))
    const error = await screen.findByText(
      "Elige el día y la hora límite para aceptar."
    )
    const hora = screen.getByLabelText("Hora")
    expect(hora).toHaveAttribute("aria-invalid", "true")
    expect(hora.getAttribute("aria-describedby")).toContain(
      error.closest("[role=alert]")?.id ?? "sin-id"
    )
  })
})
