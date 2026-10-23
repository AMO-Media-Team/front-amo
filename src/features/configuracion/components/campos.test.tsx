import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { describe, expect, it } from "vitest"

import {
  CampoAreaTexto,
  CampoCifra,
  CampoFecha,
  CampoHora,
  CampoInterruptor,
  CampoTexto,
} from "./campos"

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

/** Botón que marca un error en el campo, como lo haría la validación. */
function MarcarError({ nombre }: { nombre: string }) {
  const { setError } = useFormContext()
  return (
    <button
      type="button"
      onClick={() => setError(nombre, { message: "Revisa este dato." })}
    >
      Marcar error
    </button>
  )
}

function FormularioCampos({ children }: { children: ReactNode }) {
  const formulario = useForm({
    defaultValues: {
      nombre: "",
      monto: "",
      notas: "",
      desde: "",
      hora: "",
      activo: false,
    },
  })
  return (
    <FormProvider {...formulario}>
      <form>{children}</form>
    </FormProvider>
  )
}

describe("ayuda y error asociados al control (aria-describedby)", () => {
  it("cada campo anuncia su ayuda y, al aparecer, también el error", async () => {
    render(
      <FormularioCampos>
        <CampoTexto
          nombre="nombre"
          etiqueta="Nombre"
          descripcion="Como en el RUT."
        />
        <CampoCifra nombre="monto" etiqueta="Monto" descripcion="En pesos." />
        <CampoAreaTexto
          nombre="notas"
          etiqueta="Notas"
          descripcion="Hasta 500 caracteres."
        />
        <CampoFecha
          nombre="desde"
          etiqueta="Desde"
          descripcion="Día de Bogotá."
        />
        <CampoHora
          nombre="hora"
          etiqueta="Hora"
          descripcion="Hora de Colombia."
        />
        <MarcarError nombre="monto" />
      </FormularioCampos>
    )
    expect(
      screen.getByRole("textbox", { name: "Nombre" })
    ).toHaveAccessibleDescription("Como en el RUT.")
    expect(
      screen.getByRole("textbox", { name: "Notas" })
    ).toHaveAccessibleDescription("Hasta 500 caracteres.")
    expect(
      screen.getByRole("button", { name: /Desde/ })
    ).toHaveAccessibleDescription("Día de Bogotá.")
    expect(screen.getByLabelText("Hora")).toHaveAccessibleDescription(
      "Hora de Colombia."
    )
    const monto = screen.getByRole("textbox", { name: "Monto" })
    expect(monto).toHaveAccessibleDescription("En pesos.")

    await userEvent.click(screen.getByRole("button", { name: "Marcar error" }))
    expect(monto).toHaveAccessibleDescription("En pesos. Revisa este dato.")
    expect(monto).toHaveAttribute("aria-invalid", "true")
  })

  it("sin ayuda ni error no apunta a nada", async () => {
    render(
      <FormularioCampos>
        <CampoTexto nombre="nombre" etiqueta="Nombre" />
        <MarcarError nombre="nombre" />
      </FormularioCampos>
    )
    const nombre = screen.getByRole("textbox", { name: "Nombre" })
    expect(nombre).not.toHaveAttribute("aria-describedby")
    await userEvent.click(screen.getByRole("button", { name: "Marcar error" }))
    expect(nombre).toHaveAccessibleDescription("Revisa este dato.")
  })

  it("el interruptor anuncia su explicación", () => {
    render(
      <FormularioCampos>
        <CampoInterruptor
          nombre="activo"
          etiqueta="Activo"
          descripcion="Lo ven los medios."
        />
      </FormularioCampos>
    )
    expect(
      screen.getByRole("switch", { name: "Activo" })
    ).toHaveAccessibleDescription("Lo ven los medios.")
  })
})
