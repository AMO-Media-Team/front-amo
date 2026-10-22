import { zodResolver } from "@hookform/resolvers/zod"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormProvider, useForm } from "react-hook-form"
import { describe, expect, it } from "vitest"

import { valoresFormulario } from "../filas"
import { esquemaAnunciante } from "../schemas"
import { CamposNit } from "./campos-nit"

function Formulario({ nit = "", dv = "" }: { nit?: string; dv?: string }) {
  const formulario = useForm({
    resolver: zodResolver(esquemaAnunciante),
    defaultValues: { ...valoresFormulario(null), nit, digitoVerificacion: dv },
    mode: "onTouched",
  })
  return (
    <FormProvider {...formulario}>
      <form onSubmit={formulario.handleSubmit(() => {})} noValidate>
        <CamposNit />
        <button type="submit">Registrar</button>
      </form>
    </FormProvider>
  )
}

const campoNit = () => screen.getByRole("textbox", { name: "NIT" })
const campoDv = () =>
  screen.getByRole("textbox", { name: /dígito de verificación/ })

describe("CamposNit", () => {
  it("sugiere el DV en cuanto el NIT está completo y lo aplica con «Usar»", async () => {
    const usuario = userEvent.setup()
    render(<Formulario />)
    expect(
      screen.getByText(/Escríbelo sin el dígito de verificación/)
    ).toBeInTheDocument()

    await usuario.type(campoNit(), "900123456")
    expect(campoDv()).toHaveAttribute("placeholder", "8")
    expect(campoDv()).toHaveAccessibleDescription(
      /Según el NIT, el dígito de verificación es 8/
    )

    await usuario.click(screen.getByRole("button", { name: "Usar 8" }))
    expect(campoDv()).toHaveValue("8")
    expect(
      screen.getByText("El dígito de verificación coincide con el NIT.")
    ).toBeInTheDocument()
  })

  it("al salir del NIT lo agrupa con puntos, como en el RUT", async () => {
    const usuario = userEvent.setup()
    render(<Formulario />)
    await usuario.type(campoNit(), "900123456")
    await usuario.tab()
    expect(campoNit()).toHaveValue("900.123.456")
  })

  it("pegar «NIT-DV» reparte cada parte en su campo", async () => {
    const usuario = userEvent.setup()
    render(<Formulario />)
    await usuario.click(campoNit())
    await usuario.paste("900.123.456-8")
    expect(campoNit()).toHaveValue("900.123.456")
    expect(campoDv()).toHaveValue("8")
  })

  it("un DV que no corresponde muestra el error al salir del campo", async () => {
    const usuario = userEvent.setup()
    render(<Formulario nit="900.123.456" />)
    await usuario.type(campoDv(), "7")
    await usuario.tab()
    expect(
      await screen.findByText(
        "No corresponde al NIT: para 900.123.456 es 8. Revisa ambos en el RUT."
      )
    ).toBeInTheDocument()
    expect(campoDv()).toHaveAttribute("aria-invalid", "true")
  })

  it("al corregir el NIT revisa de nuevo el DV y retira el error viejo", async () => {
    const usuario = userEvent.setup()
    render(<Formulario nit="900.123.456" />)
    await usuario.type(campoDv(), "5")
    await usuario.tab()
    expect(await screen.findByText(/No corresponde al NIT/)).toBeInTheDocument()

    await usuario.clear(campoNit())
    await usuario.type(campoNit(), "900123457")
    expect(
      await screen.findByText("El dígito de verificación coincide con el NIT.")
    ).toBeInTheDocument()
    expect(screen.queryByText(/No corresponde al NIT/)).not.toBeInTheDocument()
    expect(campoDv()).not.toHaveAttribute("aria-invalid")
  })

  it("tras un envío fallido, «Usar» retira el error del DV", async () => {
    const usuario = userEvent.setup()
    render(<Formulario nit="900.123.456" />)
    await usuario.click(screen.getByRole("button", { name: "Registrar" }))
    expect(
      await screen.findByText(
        "Escribe el dígito de verificación (según el NIT es 8)."
      )
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: "Usar 8" }))
    expect(campoDv()).toHaveValue("8")
    expect(
      screen.queryByText(/Escribe el dígito de verificación/)
    ).not.toBeInTheDocument()
    expect(campoDv()).not.toHaveAttribute("aria-invalid")
  })
})
