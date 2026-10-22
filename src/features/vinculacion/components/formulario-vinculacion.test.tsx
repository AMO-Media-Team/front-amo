import { render, screen, waitFor } from "@testing-library/react"
import userEvent, { type UserEvent } from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { DatosFormularioPublico } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  registrarSolicitudVinculacion: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { FormularioVinculacion } from "./formulario-vinculacion"

const DATOS: DatosFormularioPublico = {
  territorio: {
    departamentos: [
      {
        codigo: "52",
        nombre: "Nariño",
        nombreCorto: "Nariño",
        region: "Pacífica",
      },
    ],
    municipios: [
      {
        codigo: "52001",
        nombre: "Pasto",
        departamentoCodigo: "52",
        esCapital: true,
      },
      {
        codigo: "52835",
        nombre: "Tumaco",
        departamentoCodigo: "52",
        esCapital: false,
      },
    ],
  },
  politica: {
    version: "1.0",
    vigenteDesde: "2026-01-15T05:00:00.000Z",
    contenidoMd: "Tratamos tus datos con cuidado.",
  },
  umbralSeguidores: 30_000,
}

// `cmdk` mide su contenido; la confirmación se lleva a la vista.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  acciones.registrarSolicitudVinculacion.mockReset()
  acciones.registrarSolicitudVinculacion.mockResolvedValue(exito())
})

async function llenarFormulario(usuario: UserEvent) {
  await usuario.type(
    screen.getByLabelText("Nombre del medio"),
    "Noticias  Pasto "
  )
  await usuario.click(screen.getByRole("combobox", { name: "Departamento" }))
  await usuario.click(await screen.findByRole("option", { name: /Nariño/ }))
  await usuario.click(await screen.findByRole("option", { name: /Pasto/ }))
  await usuario.type(
    screen.getByLabelText("Usuario o enlace"),
    "instagram.com/Noticias.Pasto"
  )
  await usuario.type(screen.getByLabelText("Seguidores"), "45 mil")
  await usuario.type(screen.getByLabelText("Tu nombre"), "Ana Pérez")
  await usuario.type(
    screen.getByLabelText("Correo electrónico"),
    "Ana@NoticiasPasto.co"
  )
  await usuario.click(
    screen.getByRole("checkbox", {
      name: "Autorizo a AMO a tratar mis datos personales",
    })
  )
}

describe("FormularioVinculacion", () => {
  it("sin datos no envía: marca los campos y enfoca el primero", async () => {
    const usuario = userEvent.setup()
    render(<FormularioVinculacion datos={DATOS} />)

    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )

    expect(
      await screen.findByText("Escribe el nombre del medio.")
    ).toBeInTheDocument()
    expect(screen.getByText("Elige el municipio.")).toBeInTheDocument()
    expect(
      screen.getByText("Escribe el usuario o pega el enlace del perfil.")
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Para enviar la solicitud debes autorizar el tratamiento de tus datos."
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Nombre del medio")).toHaveFocus()
    expect(screen.getByLabelText("Nombre del medio")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(acciones.registrarSolicitudVinculacion).not.toHaveBeenCalled()
  })

  it("envía lo escrito y confirma con el nombre y el correo normalizados", async () => {
    const usuario = userEvent.setup()
    render(<FormularioVinculacion datos={DATOS} />)

    await llenarFormulario(usuario)
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )

    const titulo = await screen.findByRole("heading", {
      name: "¡Recibimos tu solicitud!",
    })
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(screen.getByText("Noticias Pasto")).toBeInTheDocument()
    expect(screen.getByText("ana@noticiaspasto.co")).toBeInTheDocument()

    // El servidor recibe los valores tal como se escribieron (aplica el mismo esquema).
    expect(acciones.registrarSolicitudVinculacion).toHaveBeenCalledWith(
      expect.objectContaining({
        nombreMedio: "Noticias  Pasto ",
        municipioCodigo: "52001",
        cuentas: [
          {
            plataforma: "INSTAGRAM",
            usuario: "instagram.com/Noticias.Pasto",
            seguidores: "45 mil",
          },
        ],
        contactoNombre: "Ana Pérez",
        email: "Ana@NoticiasPasto.co",
        autorizaDatos: true,
        sitioWeb: "",
      })
    )
  })

  it("«Corregir el correo» vuelve al formulario con lo escrito", async () => {
    const usuario = userEvent.setup()
    render(<FormularioVinculacion datos={DATOS} />)
    await llenarFormulario(usuario)
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )

    await usuario.click(
      await screen.findByRole("button", { name: "Corregir el correo" })
    )

    expect(screen.getByLabelText("Correo electrónico")).toHaveValue(
      "Ana@NoticiasPasto.co"
    )
    await waitFor(() =>
      expect(screen.getByLabelText("Correo electrónico")).toHaveFocus()
    )
    expect(
      screen.getByRole("combobox", { name: "Municipio" })
    ).toHaveTextContent("Pasto")
  })

  it("no reenvía con el mismo correo (la BD no lo registraría): pide corregirlo", async () => {
    const usuario = userEvent.setup()
    render(<FormularioVinculacion datos={DATOS} />)
    await llenarFormulario(usuario)
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )
    await usuario.click(
      await screen.findByRole("button", { name: "Corregir el correo" })
    )

    // Mismo correo con otra escritura: el esquema lo normaliza igual.
    const correo = screen.getByLabelText("Correo electrónico")
    await usuario.clear(correo)
    await usuario.type(correo, " ANA@noticiaspasto.co ")
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )

    expect(
      await screen.findByText(
        "Ya recibimos tu solicitud con este correo. Si lo escribiste mal, corrígelo para enviarla de nuevo."
      )
    ).toBeInTheDocument()
    expect(correo).toHaveFocus()
    expect(correo).toHaveAttribute("aria-invalid", "true")
    expect(acciones.registrarSolicitudVinculacion).toHaveBeenCalledTimes(1)

    // Con el correo corregido sí se envía.
    await usuario.clear(correo)
    await usuario.type(correo, "contacto@noticiaspasto.co")
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )
    expect(
      await screen.findByText("contacto@noticiaspasto.co")
    ).toBeInTheDocument()
    expect(acciones.registrarSolicitudVinculacion).toHaveBeenCalledTimes(2)
  })

  it("muestra el límite por conexión junto al botón y conserva lo escrito", async () => {
    const usuario = userEvent.setup()
    acciones.registrarSolicitudVinculacion.mockResolvedValue(
      fallo(
        "Recibimos varias solicitudes desde tu conexión. Intenta de nuevo mañana."
      )
    )
    render(<FormularioVinculacion datos={DATOS} />)
    await llenarFormulario(usuario)
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Recibimos varias solicitudes desde tu conexión."
    )
    expect(screen.getByLabelText("Tu nombre")).toHaveValue("Ana Pérez")
  })

  it("lleva un error de campo del servidor a su campo", async () => {
    const usuario = userEvent.setup()
    acciones.registrarSolicitudVinculacion.mockResolvedValue(
      fallo("Revisa los campos marcados.", {
        "cuentas.0.usuario": ["Ya agregaste esta cuenta."],
      })
    )
    render(<FormularioVinculacion datos={DATOS} />)
    await llenarFormulario(usuario)
    await usuario.click(
      screen.getByRole("button", { name: "Enviar solicitud" })
    )

    expect(
      await screen.findByText("Ya agregaste esta cuenta.")
    ).toBeInTheDocument()
    // El foco llega cuando el envío termina y los campos se habilitan.
    await waitFor(() =>
      expect(screen.getByLabelText("Usuario o enlace")).toHaveFocus()
    )
  })

  it("agrega otra cuenta proponiendo la red que falta", async () => {
    const usuario = userEvent.setup()
    render(<FormularioVinculacion datos={DATOS} />)

    await usuario.click(
      screen.getByRole("button", { name: "Agregar otra cuenta" })
    )

    expect(screen.getAllByLabelText("Usuario o enlace")).toHaveLength(2)
    expect(screen.getAllByLabelText("Usuario o enlace")[1]).toHaveFocus()
    expect(
      screen.getByRole("radiogroup", { name: "Red social de la cuenta 2" })
    ).toHaveTextContent("Facebook")
    expect(
      screen.getByRole("radio", { name: "Facebook", checked: true })
    ).toBeInTheDocument()
  })

  it("el campo trampa no se ve ni se alcanza con el teclado", () => {
    render(<FormularioVinculacion datos={DATOS} />)
    const trampa = document.getElementById("vincular-sitio-web")
    expect(trampa).toHaveAttribute("tabindex", "-1")
    expect(trampa?.closest("[aria-hidden='true']")).not.toBeNull()
    expect(
      screen.queryByRole("textbox", { name: /Sitio web/ })
    ).not.toBeInTheDocument()
  })

  it("abre la política de datos vigente sin salir del formulario", async () => {
    const usuario = userEvent.setup()
    render(<FormularioVinculacion datos={DATOS} />)

    await usuario.click(
      screen.getByRole("button", {
        name: "Lee la política de tratamiento de datos",
      })
    )

    const dialogo = await screen.findByRole("dialog", {
      name: "Política de tratamiento de datos",
    })
    expect(dialogo).toHaveTextContent("Tratamos tus datos con cuidado.")
    expect(dialogo).toHaveTextContent("Versión 1.0")
  })
})
