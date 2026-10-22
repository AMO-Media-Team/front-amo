import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fallo } from "@/lib/result"

import type { DocumentoConTexto } from "./documento-terminos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ aceptarTerminos: vi.fn() }))
vi.mock("../actions", () => acciones)

import { FormularioTerminos } from "./formulario-terminos"

const TERMINOS: DocumentoConTexto = {
  id: "0192f3a4-5b6c-7d8e-9f01-00000000000a",
  tipo: "TERMINOS_MEDIO",
  titulo: "Términos para medios",
  resumen: "Las reglas para recibir ofertas de pauta.",
  aceptacion: "He leído y acepto los términos para medios.",
  accion: "Acepto los términos",
  vigencia: "Versión 1.0 · vigente desde el 22 de octubre de 2026",
  actualizado: false,
  texto: <p>Primera cláusula de los términos.</p>,
}

const POLITICA: DocumentoConTexto = {
  ...TERMINOS,
  id: "0192f3a4-5b6c-7d8e-9f01-00000000000b",
  tipo: "POLITICA_DATOS",
  titulo: "Política de tratamiento de datos",
  aceptacion:
    "He leído la política y autorizo el tratamiento de mis datos personales.",
  accion: "Autorizo el tratamiento",
  actualizado: true,
  texto: <p>Tratamos tus datos con cuidado.</p>,
}

const casilla = (nombre: string) =>
  screen.getByRole("checkbox", { name: nombre })

function renderizar(documentos = [TERMINOS, POLITICA], siguiente?: string) {
  const usuario = userEvent.setup()
  render(<FormularioTerminos documentos={documentos} siguiente={siguiente} />)
  return usuario
}

beforeEach(() => {
  acciones.aceptarTerminos.mockReset()
  acciones.aceptarTerminos.mockResolvedValue(
    fallo("No pudimos completar la operación.")
  )
})

describe("FormularioTerminos", () => {
  it("muestra cada documento con su texto, vigencia y casilla", () => {
    renderizar()
    const terminos = screen.getByRole("region", {
      name: "Términos para medios",
    })
    expect(
      within(terminos).getByRole("heading", { name: "Términos para medios" })
    ).toBeInTheDocument()
    expect(
      within(terminos).getByText(
        "Versión 1.0 · vigente desde el 22 de octubre de 2026"
      )
    ).toBeInTheDocument()
    expect(
      within(terminos).getByRole("region", {
        name: "Texto de Términos para medios",
      })
    ).toHaveTextContent("Primera cláusula de los términos.")
    expect(casilla(TERMINOS.aceptacion)).not.toBeChecked()
    // Solo la política es una versión nueva de algo ya aceptado.
    expect(within(terminos).queryByText("Versión nueva")).toBeNull()
    expect(
      within(
        screen.getByRole("region", { name: "Política de tratamiento de datos" })
      ).getByText("Versión nueva")
    ).toBeInTheDocument()
  })

  it("sin marcar todo no envía: avisa cuántos faltan y lleva el foco a la primera casilla", async () => {
    const usuario = renderizar()
    await usuario.click(casilla(POLITICA.aceptacion))
    await usuario.click(
      screen.getByRole("button", { name: "Aceptar y continuar" })
    )

    expect(acciones.aceptarTerminos).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Te falta aceptar 1 documento para continuar."
    )
    const pendiente = casilla(TERMINOS.aceptacion)
    expect(pendiente).toHaveFocus()
    expect(pendiente).toHaveAttribute("aria-invalid", "true")
    expect(pendiente).toHaveAccessibleDescription(
      "Marca la casilla para aceptar este documento."
    )
  })

  it("cuenta el progreso al marcar", async () => {
    const usuario = renderizar()
    expect(screen.getByText("0 de 2 aceptados")).toBeInTheDocument()
    await usuario.click(casilla(TERMINOS.aceptacion))
    expect(screen.getByText("1 de 2 aceptados")).toBeInTheDocument()
    await usuario.click(casilla(POLITICA.aceptacion))
    expect(screen.getByText("Los 2 aceptados")).toBeInTheDocument()
  })

  it("con un solo documento no muestra el progreso", () => {
    renderizar([TERMINOS])
    expect(screen.queryByText(/aceptados$/)).toBeNull()
  })

  it("con todo marcado envía lo mostrado, lo aceptado y el destino", async () => {
    const usuario = renderizar(undefined, "/notificaciones")
    await usuario.click(casilla(TERMINOS.aceptacion))
    await usuario.click(casilla(POLITICA.aceptacion))
    await usuario.click(
      screen.getByRole("button", { name: "Aceptar y continuar" })
    )

    await waitFor(() => expect(acciones.aceptarTerminos).toHaveBeenCalled())
    const datos = acciones.aceptarTerminos.mock.calls[0][1] as FormData
    expect(datos.getAll("mostrada")).toEqual([TERMINOS.id, POLITICA.id])
    expect(datos.getAll("aceptada")).toEqual([TERMINOS.id, POLITICA.id])
    expect(datos.get("next")).toBe("/notificaciones")
    // El fallo del servidor se muestra como mensaje general.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos completar la operación."
    )
  })

  it("desde la lectura en pantalla completa también se acepta", async () => {
    const usuario = renderizar()
    const politica = screen.getByRole("region", {
      name: "Política de tratamiento de datos",
    })
    await usuario.click(
      within(politica).getByRole("button", {
        name: "Leer en pantalla completa",
      })
    )
    const hoja = await screen.findByRole("dialog", {
      name: "Política de tratamiento de datos",
    })
    expect(hoja).toHaveTextContent("Tratamos tus datos con cuidado.")
    await usuario.click(
      within(hoja).getByRole("button", { name: "Autorizo el tratamiento" })
    )

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(casilla(POLITICA.aceptacion)).toBeChecked()
    expect(casilla(TERMINOS.aceptacion)).not.toBeChecked()
  })
})
