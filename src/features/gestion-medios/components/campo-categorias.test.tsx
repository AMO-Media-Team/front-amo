import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { describe, expect, it } from "vitest"

import { LIMITES_MEDIO } from "../schemas"
import type { OpcionCategoria } from "../tipos"
import { CampoCategorias } from "./campo-categorias"

/** Lo que el formulario guardaría: los ids elegidos, en orden. */
function Valor() {
  const ids = useWatch({ name: "categoriaIds" }) as string[]
  return <output data-testid="valor">{ids.join(",")}</output>
}

function Formulario({
  opciones,
  inicial = [],
}: {
  opciones: readonly OpcionCategoria[] | null
  inicial?: string[]
}) {
  const formulario = useForm({ defaultValues: { categoriaIds: inicial } })
  return (
    <FormProvider {...formulario}>
      <form>
        <CampoCategorias opciones={opciones} />
      </form>
      <Valor />
    </FormProvider>
  )
}

const OPCIONES: OpcionCategoria[] = [
  { id: "a", nombre: "Deportes" },
  { id: "b", nombre: "Cultura" },
]

describe("CampoCategorias", () => {
  it("marca y desmarca categorías como casillas con nombre", async () => {
    render(<Formulario opciones={OPCIONES} />)
    const grupo = screen.getByRole("group", { name: /Categorías temáticas/ })
    expect(grupo).toBeInTheDocument()

    await userEvent.click(screen.getByRole("checkbox", { name: "Cultura" }))
    await userEvent.click(screen.getByRole("checkbox", { name: "Deportes" }))
    expect(screen.getByTestId("valor")).toHaveTextContent("b,a")

    await userEvent.click(screen.getByRole("checkbox", { name: "Cultura" }))
    expect(screen.getByTestId("valor")).toHaveTextContent(/^a$/)
  })

  it("al llegar al máximo deshabilita las no elegidas y lo explica", () => {
    const opciones = Array.from(
      { length: LIMITES_MEDIO.categoriasMax + 1 },
      (_, indice) => ({ id: `c${indice}`, nombre: `Tema ${indice}` })
    )
    render(
      <Formulario
        opciones={opciones}
        inicial={opciones
          .slice(0, LIMITES_MEDIO.categoriasMax)
          .map((opcion) => opcion.id)}
      />
    )
    const ultima = screen.getByRole("checkbox", {
      name: `Tema ${LIMITES_MEDIO.categoriasMax}`,
    })
    expect(ultima).toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByRole("checkbox", { name: "Tema 0" })
    ).not.toHaveAttribute("aria-disabled", "true")
    expect(
      screen.getByText(
        new RegExp(`Llegaste al máximo de ${LIMITES_MEDIO.categoriasMax}`)
      )
    ).toBeInTheDocument()
  })

  it("señala la categoría archivada que el medio conserva", () => {
    render(
      <Formulario
        opciones={[...OPCIONES, { id: "z", nombre: "Humor", archivada: true }]}
        inicial={["z"]}
      />
    )
    expect(screen.getByRole("checkbox", { name: /Humor/ })).toBeChecked()
    expect(screen.getByText("(archivada)")).toBeInTheDocument()
  })

  it("una elegida que ya no está entre las opciones sigue a la vista y se puede desmarcar", async () => {
    render(<Formulario opciones={OPCIONES} inicial={["a", "retirada"]} />)
    const retirada = screen.getByRole("checkbox", {
      name: /Categoría retirada/,
    })
    expect(retirada).toBeChecked()
    expect(screen.getByText("(ya no disponible)")).toBeInTheDocument()

    await userEvent.click(retirada)
    expect(screen.getByTestId("valor")).toHaveTextContent(/^a$/)
    expect(
      screen.queryByRole("checkbox", { name: /Categoría retirada/ })
    ).not.toBeInTheDocument()
  })

  it("explica qué hacer si no hay categorías o no se pudieron cargar", () => {
    const { rerender } = render(<Formulario opciones={null} />)
    expect(
      screen.getByText(/No pudimos cargar las categorías/)
    ).toBeInTheDocument()
    rerender(<Formulario opciones={[]} />)
    expect(
      screen.getByText(/Aún no hay categorías activas/)
    ).toBeInTheDocument()
  })
})
