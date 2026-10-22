import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { DocumentoEnCola } from "../tipos"

const acciones = vi.hoisted(() => ({
  aprobarDocumento: vi.fn(),
  rechazarDocumento: vi.fn(),
  firmarDocumento: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { RevisorDocumentos } from "./revisor-documentos"

function enCola(
  id: string,
  tipo: DocumentoEnCola["tipo"],
  medio: string
): DocumentoEnCola {
  return {
    id,
    tipo,
    estado: "PENDIENTE",
    metodo: "ARCHIVO",
    venceAt: null,
    subidoAt: "2026-10-20T15:00:00.000Z",
    observaciones: null,
    validadoAt: null,
    mime: "application/pdf",
    medio: { id: `${id}-medio`, nombre: medio, estado: "PENDIENTE", nivel: 0 },
  }
}

const COLA = [
  enCola(
    "0192f3a4-5b6c-7d8e-9f01-000000000001",
    "CEDULA_FRENTE",
    "Radio Pasto"
  ),
  enCola("0192f3a4-5b6c-7d8e-9f01-000000000002", "RUT", "Noticias Ipiales"),
]

beforeEach(() => {
  acciones.aprobarDocumento.mockReset().mockResolvedValue(exito())
  acciones.firmarDocumento
    .mockReset()
    .mockResolvedValue(
      exito({ url: "https://x/firmada", vigenciaSegundos: 300 })
    )
})

describe("RevisorDocumentos", () => {
  it("cada tarjeta abre su revisión", async () => {
    const usuario = userEvent.setup()
    render(<RevisorDocumentos documentos={COLA} hoy="2026-10-22" />)
    expect(
      screen.getByRole("list", { name: "Documentos por revisar" })
    ).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Revisar RUT de Noticias Ipiales" })
    )
    expect(
      screen.getByRole("dialog", { name: "Revisar RUT" })
    ).toBeInTheDocument()
  })

  it("al aprobar uno abre el siguiente de la cola", async () => {
    const usuario = userEvent.setup()
    render(<RevisorDocumentos documentos={COLA} hoy="2026-10-22" />)
    await usuario.click(
      screen.getByRole("button", {
        name: "Revisar cédula (frente) de Radio Pasto",
      })
    )
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Revisar RUT" })
      ).toBeInTheDocument()
    )
  })

  it("al decidir el último se cierra", async () => {
    const usuario = userEvent.setup()
    render(<RevisorDocumentos documentos={COLA} hoy="2026-10-22" />)
    await usuario.click(
      screen.getByRole("button", { name: "Revisar RUT de Noticias Ipiales" })
    )
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
