import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { describe, expect, it } from "vitest"

import { CampoFecha } from "./campos"

/** Lo que el formulario guardaría: el valor del campo tal como quedó. */
function Valor() {
  return <output data-testid="valor">{useWatch({ name: "desde" })}</output>
}

function Formulario({
  inicial = "",
  children,
}: {
  inicial?: string
  children: ReactNode
}) {
  const formulario = useForm({ defaultValues: { desde: inicial } })
  return (
    <FormProvider {...formulario}>
      <form>{children}</form>
      <Valor />
    </FormProvider>
  )
}

describe("CampoFecha", () => {
  it("el calendario es un diálogo con el nombre del campo", async () => {
    render(
      <Formulario>
        <CampoFecha nombre="desde" etiqueta="Vigente desde" />
      </Formulario>
    )
    await userEvent.click(screen.getByRole("button", { name: /Vigente desde/ }))
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Elegir la fecha: Vigente desde"
    )
  })

  it("una etiqueta que no es texto deja un nombre genérico", async () => {
    render(
      <Formulario>
        <CampoFecha nombre="desde" etiqueta={<span>Vigente desde</span>} />
      </Formulario>
    )
    await userEvent.click(screen.getByRole("button", { name: /Vigente desde/ }))
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Elegir la fecha"
    )
  })

  it("elegir un día guarda el día de calendario y cierra", async () => {
    render(
      <Formulario inicial="2026-10-05">
        <CampoFecha nombre="desde" etiqueta="Vigente desde" />
      </Formulario>
    )
    await userEvent.click(screen.getByRole("button", { name: /Vigente desde/ }))
    const calendario = await screen.findByRole("dialog")
    await userEvent.click(
      within(calendario).getByRole("button", { name: /15 de octubre/ })
    )
    expect(screen.getByTestId("valor")).toHaveTextContent("2026-10-15")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
