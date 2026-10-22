import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction,
} from "nuqs/adapters/testing"
import { useState } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { Asistente, type PasoAsistente, useAsistente } from "./asistente"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeAll(() => {
  // jsdom no implementa el desplazamiento.
  Element.prototype.scrollIntoView = vi.fn()
})

type Id = "que" | "quien" | "revision"

function CampoNombre({ invalido }: { invalido: boolean }) {
  return (
    <label>
      Nombre
      <input name="nombre" aria-invalid={invalido || undefined} />
    </label>
  )
}

function Revision() {
  const { irA } = useAsistente<Id>()
  return (
    <button type="button" onClick={() => void irA("que")}>
      Editar qué se publica
    </button>
  )
}

function Prueba({
  validarPrimero = () => true,
  onEnviar = vi.fn(),
  onGuardarBorrador,
  completos = [false, false, false],
}: {
  validarPrimero?: () => boolean
  onEnviar?: () => unknown
  onGuardarBorrador?: () => unknown
  completos?: readonly boolean[]
}) {
  const [invalido, setInvalido] = useState(false)
  const pasos: PasoAsistente<Id>[] = [
    {
      id: "que",
      titulo: "Qué se publica",
      contenido: <CampoNombre invalido={invalido} />,
      validar: () => {
        const valido = validarPrimero()
        setInvalido(!valido)
        return valido
      },
      completo: completos[0],
    },
    {
      id: "quien",
      titulo: "A quién le llega",
      contenido: <p>Territorio</p>,
      completo: completos[1],
    },
    {
      id: "revision",
      titulo: "Revisión",
      contenido: <Revision />,
      completo: completos[2],
    },
  ]
  return (
    <Asistente
      pasos={pasos}
      etiqueta="Nueva oferta"
      onEnviar={onEnviar}
      onGuardarBorrador={onGuardarBorrador}
      textoEnviar="Enviar a revisión"
    />
  )
}

function dibujar(
  busqueda = "",
  props: Parameters<typeof Prueba>[0] = {},
  alActualizar?: OnUrlUpdateFunction
) {
  return render(
    <NuqsTestingAdapter
      searchParams={busqueda}
      hasMemory
      onUrlUpdate={alActualizar}
    >
      <Prueba {...props} />
    </NuqsTestingAdapter>
  )
}

const titulo = (nombre: RegExp) => screen.getByRole("heading", { name: nombre })

describe("Asistente", () => {
  it("empieza en el primer paso con el indicador accesible", () => {
    dibujar()
    expect(titulo(/Paso 1 de 3: Qué se publica/)).toBeVisible()
    const pasos = within(screen.getByRole("list", { name: "Pasos" }))
    expect(pasos.getAllByRole("listitem")).toHaveLength(3)
    expect(
      pasos.getByText(/Qué se publica/).closest("[aria-current]")
    ).toHaveAttribute("aria-current", "step")
    // Los pasos aún bloqueados no son botones.
    expect(pasos.queryAllByRole("button")).toHaveLength(0)
    expect(
      screen.queryByRole("button", { name: /Atrás/ })
    ).not.toBeInTheDocument()
  })

  it("no avanza si el paso no valida: avisa y lleva el foco al campo inválido", async () => {
    const usuario = userEvent.setup()
    dibujar("", { validarPrimero: () => false })
    await usuario.click(screen.getByRole("button", { name: /Siguiente/ }))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus()
    )
    expect(titulo(/Qué se publica/)).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Revisa los campos marcados en «Qué se publica» para continuar."
      )
    )
  })

  it("al avanzar guarda el paso en la URL y enfoca su título", async () => {
    const usuario = userEvent.setup()
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    dibujar("", {}, alActualizar)
    await usuario.click(screen.getByRole("button", { name: /Siguiente/ }))
    await waitFor(() =>
      expect(titulo(/Paso 2 de 3: A quién le llega/)).toHaveFocus()
    )
    expect(alActualizar.mock.lastCall?.[0].queryString).toBe("?paso=quien")
    expect(alActualizar.mock.lastCall?.[0].options.history).toBe("push")
    // El primero quedó completado y se puede volver a él desde el indicador.
    const pasos = within(screen.getByRole("list", { name: "Pasos" }))
    await usuario.click(pasos.getByRole("button", { name: /Qué se publica/ }))
    await waitFor(() => expect(titulo(/Paso 1 de 3/)).toHaveFocus())
  })

  it("Enter en un campo avanza al siguiente paso", async () => {
    const usuario = userEvent.setup()
    dibujar()
    await usuario.type(
      screen.getByRole("textbox", { name: "Nombre" }),
      "Radio{Enter}"
    )
    await waitFor(() => expect(titulo(/A quién le llega/)).toBeVisible())
  })

  it("si la URL pide un paso bloqueado, muestra el primero pendiente y corrige la URL", async () => {
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    dibujar("?paso=revision", { completos: [true, false, false] }, alActualizar)
    expect(titulo(/Paso 2 de 3: A quién le llega/)).toBeVisible()
    await waitFor(() =>
      expect(alActualizar.mock.lastCall?.[0].queryString).toBe("?paso=quien")
    )
    expect(alActualizar.mock.lastCall?.[0].options.history).toBe("replace")
  })

  it("enviar valida todos los pasos, llama a onEnviar y desde la revisión se puede editar", async () => {
    const usuario = userEvent.setup()
    const onEnviar = vi.fn()
    dibujar("?paso=revision", { completos: [true, true, true], onEnviar })
    expect(titulo(/Revisión/)).toBeVisible()
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1))

    await usuario.click(
      screen.getByRole("button", { name: "Editar qué se publica" })
    )
    await waitFor(() => expect(titulo(/Qué se publica/)).toBeVisible())
  })

  it("al superar el paso se limpia el aviso; «Atrás» vuelve sin validar", async () => {
    const usuario = userEvent.setup()
    const validarPrimero = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true)
    dibujar("", { validarPrimero })
    const siguiente = screen.getByRole("button", { name: /Siguiente/ })
    await usuario.click(siguiente)
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/Revisa los campos/)
    )

    await usuario.click(siguiente)
    await waitFor(() =>
      expect(titulo(/Paso 2 de 3: A quién le llega/)).toHaveFocus()
    )
    expect(screen.getByRole("status")).toBeEmptyDOMElement()

    await usuario.click(screen.getByRole("button", { name: "Atrás" }))
    await waitFor(() => expect(titulo(/Paso 1 de 3/)).toHaveFocus())
    expect(validarPrimero).toHaveBeenCalledTimes(2)
  })

  it("«Guardar borrador» no valida ni cambia de paso", async () => {
    const usuario = userEvent.setup()
    const validarPrimero = vi.fn(() => false)
    const onGuardarBorrador = vi.fn()
    dibujar("", { validarPrimero, onGuardarBorrador })
    await usuario.click(
      screen.getByRole("button", { name: "Guardar borrador" })
    )
    await waitFor(() => expect(onGuardarBorrador).toHaveBeenCalledTimes(1))
    expect(validarPrimero).not.toHaveBeenCalled()
    expect(titulo(/Paso 1 de 3/)).toBeVisible()
  })

  it("si onEnviar devuelve true, el asistente queda bloqueado (sin doble envío)", async () => {
    const usuario = userEvent.setup()
    const onEnviar = vi.fn(() => true)
    dibujar("?paso=revision", { completos: [true, true, true], onEnviar })
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    const enviando = await screen.findByRole("button", { name: /Enviando…/ })
    expect(enviando).toHaveAttribute("aria-disabled", "true")
    await usuario.click(enviando)
    expect(onEnviar).toHaveBeenCalledTimes(1)
  })

  it("si un paso anterior no valida al enviar, vuelve a él sin enviar", async () => {
    const usuario = userEvent.setup()
    const onEnviar = vi.fn()
    dibujar("?paso=revision", {
      completos: [true, true, true],
      validarPrimero: () => false,
      onEnviar,
    })
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    await waitFor(() => expect(titulo(/Qué se publica/)).toBeVisible())
    expect(onEnviar).not.toHaveBeenCalled()
  })
})
