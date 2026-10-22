import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { DocumentoExpediente } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  aprobarDocumento: vi.fn(),
  rechazarDocumento: vi.fn(),
  firmarDocumento: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { HojaDocumento } from "./revision-documento"

const HOY = "2026-10-22"
const MEDIO = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa",
  nombre: "Radio Pasto",
}

const PENDIENTE: DocumentoExpediente = {
  id: "0192f3a4-5b6c-7d8e-9f01-000000000001",
  tipo: "CEDULA_FRENTE",
  estado: "PENDIENTE",
  metodo: "ARCHIVO",
  venceAt: null,
  subidoAt: "2026-10-20T15:00:00.000Z",
  observaciones: null,
  validadoAt: null,
  mime: "application/pdf",
}

function renderizar(documento = PENDIENTE) {
  const usuario = userEvent.setup()
  const onDecidido = vi.fn()
  render(
    <HojaDocumento
      documento={documento}
      medio={MEDIO}
      hoy={HOY}
      abierta
      onAbiertaChange={() => {}}
      onDecidido={onDecidido}
    />
  )
  return { usuario, onDecidido }
}

beforeEach(() => {
  acciones.aprobarDocumento.mockReset().mockResolvedValue(exito())
  acciones.rechazarDocumento.mockReset().mockResolvedValue(exito())
  acciones.firmarDocumento
    .mockReset()
    .mockResolvedValue(
      exito({ url: "https://x/firmada/cedula", vigenciaSegundos: 300 })
    )
})

describe("HojaDocumento", () => {
  it("muestra el archivo firmado, qué comprobar y la decisión", async () => {
    renderizar()
    const hoja = screen.getByRole("dialog", { name: "Revisar cédula (frente)" })
    expect(
      await within(hoja).findByRole("link", { name: /Abrir PDF/ })
    ).toHaveAttribute("href", "https://x/firmada/cedula")
    expect(acciones.firmarDocumento).toHaveBeenCalledWith({
      documentoId: PENDIENTE.id,
    })
    expect(
      within(hoja).getByRole("heading", { name: "Qué comprobar" })
    ).toBeInTheDocument()
    expect(within(hoja).getByRole("button", { name: "Rechazar" })).toBeEnabled()
    expect(within(hoja).getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })

  it("un atajo fija la vigencia y aprobar la envía con el documento", async () => {
    const { usuario, onDecidido } = renderizar()
    await usuario.click(screen.getByRole("button", { name: "1 año" }))
    expect(screen.getByLabelText(/Vigente hasta/)).toHaveValue("2027-10-22")

    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(onDecidido).toHaveBeenCalledOnce())
    expect(acciones.aprobarDocumento).toHaveBeenCalledWith({
      documentoId: PENDIENTE.id,
      fechaVencimiento: "2027-10-22",
      observaciones: "",
    })
  })

  it("un error de la BD sobre un campo se muestra en ese campo", async () => {
    acciones.aprobarDocumento.mockResolvedValue(
      fallo("La vigencia no puede ser anterior a hoy.", {
        fechaVencimiento: ["La vigencia no puede ser anterior a hoy."],
      })
    )
    const { usuario, onDecidido } = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(
      await screen.findByText("La vigencia no puede ser anterior a hoy.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Vigente hasta/)).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(onDecidido).not.toHaveBeenCalled()
  })

  it("rechazar exige un motivo y ofrece los frecuentes", async () => {
    const { usuario, onDecidido } = renderizar()
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Rechazar cédula (frente)?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar documento" })
    )
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Describe el motivo (al menos 5 caracteres)."
    )
    expect(acciones.rechazarDocumento).not.toHaveBeenCalled()

    const sugerencia = "El documento no está a nombre del titular registrado."
    await usuario.click(
      within(dialogo).getByRole("button", { name: sugerencia })
    )
    expect(within(dialogo).getByLabelText("Motivo")).toHaveValue(sugerencia)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar documento" })
    )
    await waitFor(() => expect(onDecidido).toHaveBeenCalledOnce())
    expect(acciones.rechazarDocumento).toHaveBeenCalledWith({
      documentoId: PENDIENTE.id,
      motivo: sugerencia,
    })
  })

  it("un documento ya revisado solo se consulta", () => {
    renderizar({
      ...PENDIENTE,
      estado: "APROBADO",
      venceAt: "2027-01-31",
      validadoAt: "2026-10-21T15:00:00.000Z",
    })
    const hoja = screen.getByRole("dialog", { name: "Cédula (frente)" })
    expect(within(hoja).queryByRole("button", { name: "Aprobar" })).toBeNull()
    expect(within(hoja).queryByRole("button", { name: "Rechazar" })).toBeNull()
    expect(within(hoja).getByText("Vigente hasta")).toBeInTheDocument()
  })

  it("una prueba de vida por videollamada no pide ningún archivo", () => {
    renderizar({
      ...PENDIENTE,
      tipo: "PRUEBA_VIDA",
      metodo: "VIDEOLLAMADA",
      estado: "APROBADO",
      mime: null,
      observaciones: "Atendió Ana. Mostró la cédula original.",
    })
    expect(screen.getByText("Verificada por videollamada")).toBeInTheDocument()
    expect(
      screen.getByText("Atendió Ana. Mostró la cédula original.")
    ).toBeInTheDocument()
    expect(acciones.firmarDocumento).not.toHaveBeenCalled()
  })
})
