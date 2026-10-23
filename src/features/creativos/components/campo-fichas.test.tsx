import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactNode, useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"

import { CampoFichas } from "./campo-fichas"

let valoresActuales: () => {
  hashtags: string[]
  menciones: string[]
} = () => ({
  hashtags: [],
  menciones: [],
})

function Formulario({
  children,
  inicial = [],
}: {
  children: ReactNode
  inicial?: string[]
}) {
  const formulario = useForm({
    defaultValues: { hashtags: inicial, menciones: [] as string[] },
  })
  const { getValues } = formulario
  useEffect(() => {
    valoresActuales = getValues
  }, [getValues])
  return <FormProvider {...formulario}>{children}</FormProvider>
}

function montar({
  inicial,
  onConfirmar = vi.fn(),
  maximo = 30,
}: {
  inicial?: string[]
  onConfirmar?: () => void
  maximo?: number
} = {}) {
  render(
    <Formulario inicial={inicial}>
      <CampoFichas
        nombre="hashtags"
        clase="hashtag"
        etiqueta="Hashtags"
        descripcion="Escribe cada uno y presiona Enter."
        maximo={maximo}
        sugerencias={["#Publicidad"]}
        onConfirmar={onConfirmar}
      />
    </Formulario>
  )
  return {
    onConfirmar,
    campo: screen.getByRole("textbox", { name: "Hashtags" }),
  }
}

describe("CampoFichas", () => {
  it("normaliza al confirmar con Enter y avisa para guardar", async () => {
    const usuario = userEvent.setup()
    const { campo, onConfirmar } = montar()
    await usuario.type(campo, "MiMarca{Enter}")
    expect(valoresActuales().hashtags).toEqual(["#MiMarca"])
    expect(screen.getByRole("list", { name: "Hashtags" })).toHaveTextContent(
      "#MiMarca"
    )
    expect(onConfirmar).toHaveBeenCalled()
    expect(campo).toHaveValue("")
  })

  it("agrega varios al pegar y no repite sin importar mayúsculas", async () => {
    const usuario = userEvent.setup()
    const { campo } = montar({ inicial: ["#Marca"] })
    await usuario.click(campo)
    await usuario.paste("#marca #Promo, #Temporada")
    expect(valoresActuales().hashtags).toEqual([
      "#Marca",
      "#Promo",
      "#Temporada",
    ])
  })

  it("explica lo inválido, lo deja en el cuadro y lo asocia al campo", async () => {
    const usuario = userEvent.setup()
    const { campo } = montar()
    await usuario.type(campo, "oferta!{Enter}")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "«oferta!» no es un hashtag válido"
    )
    expect(campo).toHaveValue("oferta!")
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(campo).toHaveAccessibleDescription(/no es un hashtag válido/)
    expect(valoresActuales().hashtags).toEqual([])
  })

  it("quita con su botón o con retroceso y ofrece la sugerencia", async () => {
    const usuario = userEvent.setup()
    const { campo } = montar({ inicial: ["#Uno", "#Dos"] })
    await usuario.click(screen.getByRole("button", { name: "Quitar #Uno" }))
    expect(valoresActuales().hashtags).toEqual(["#Dos"])
    await usuario.click(campo)
    await usuario.keyboard("{Backspace}")
    expect(valoresActuales().hashtags).toEqual([])
    await usuario.click(
      screen.getByRole("button", { name: "Agregar #Publicidad" })
    )
    expect(valoresActuales().hashtags).toEqual(["#Publicidad"])
    expect(
      screen.queryByRole("button", { name: "Agregar #Publicidad" })
    ).toBeNull()
  })

  it("al quitar una ficha o usar una sugerencia el foco vuelve al cuadro", async () => {
    const usuario = userEvent.setup()
    const { campo } = montar({ inicial: ["#Uno", "#Dos"] })
    await usuario.click(screen.getByRole("button", { name: "Quitar #Uno" }))
    expect(campo).toHaveFocus()
    await usuario.click(
      screen.getByRole("button", { name: "Agregar #Publicidad" })
    )
    expect(valoresActuales().hashtags).toEqual(["#Dos", "#Publicidad"])
    expect(campo).toHaveFocus()
  })

  it("al llegar al máximo queda de solo lectura, con el foco y el retroceso", async () => {
    const usuario = userEvent.setup()
    const { campo } = montar({ inicial: ["#Uno"], maximo: 2 })
    await usuario.type(campo, "Dos{Enter}")
    expect(valoresActuales().hashtags).toEqual(["#Uno", "#Dos"])
    expect(campo).not.toBeDisabled()
    expect(campo).toHaveAttribute("readonly")
    expect(campo).toHaveFocus()
    expect(campo).toHaveAccessibleDescription(/2 de 2/)
    await usuario.keyboard("Tres")
    expect(campo).toHaveValue("")
    await usuario.keyboard("{Backspace}")
    expect(valoresActuales().hashtags).toEqual(["#Uno"])
    expect(campo).not.toHaveAttribute("readonly")
    expect(campo).toHaveFocus()
  })
})
