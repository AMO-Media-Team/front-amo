import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  INSTANTANEA_INICIAL,
  type InstantaneaSubida,
} from "@/components/archivos/motor-subida"

import type { DocumentoExpediente } from "../tipos"
import { HojaCargaInterna } from "./hoja-carga-interna"
import type { CargaInterna } from "./use-carga-interna"

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

const REGISTRADO: DocumentoExpediente = {
  id: "0192f3a4-5b6c-7d8e-9f01-000000000001",
  tipo: "CAMARA_COMERCIO",
  estado: "PENDIENTE",
  venceAt: null,
  subidoAt: "2026-10-22T15:00:00.000Z",
  observaciones: null,
  validadoAt: null,
  mime: "application/pdf",
}

/** Una carga de mentira: la hoja solo pinta lo que el hook le entrega. */
function carga(
  cambios: Partial<Omit<CargaInterna, "subida">> & {
    instantanea?: Partial<InstantaneaSubida>
  } = {}
): CargaInterna {
  const { instantanea, ...resto } = cambios
  const estado = { ...INSTANTANEA_INICIAL, ...instantanea }
  return {
    subida: {
      ...estado,
      subir: vi.fn(),
      reintentar: vi.fn(),
      cancelar: vi.fn(),
      reiniciar: vi.fn(),
      activa: ["procesando", "preparando", "subiendo", "confirmando"].includes(
        estado.estado
      ),
    },
    elegido: null,
    vistaPrevia: null,
    elemento: null,
    elegir: vi.fn(),
    subir: vi.fn(async () => REGISTRADO),
    reintentar: vi.fn(async () => null),
    descartar: vi.fn(),
    ...resto,
  }
}

function renderizar(datos: CargaInterna) {
  const usuario = userEvent.setup()
  const onTipo = vi.fn()
  const onAbiertaChange = vi.fn()
  render(
    <HojaCargaInterna
      empresa="Café del Sur"
      tipo="CAMARA_COMERCIO"
      onTipo={onTipo}
      carga={datos}
      abierta
      onAbiertaChange={onAbiertaChange}
    />
  )
  return { usuario, onTipo, onAbiertaChange }
}

const PDF = new File(["%PDF-1.4"], "camara.pdf", { type: "application/pdf" })

beforeEach(() => {
  avisos.success.mockReset()
})

describe("HojaCargaInterna", () => {
  it("ofrece los cuatro tipos con el elegido marcado y avisa el cambio", async () => {
    const { usuario, onTipo } = renderizar(carga())
    const hoja = screen.getByRole("dialog", { name: "Cargar documento" })
    const tipos = within(hoja).getByRole("radiogroup", {
      name: "Tipo de documento",
    })
    expect(within(tipos).getAllByRole("radio")).toHaveLength(4)
    expect(
      within(tipos).getByRole("radio", { name: /^Cámara de Comercio/ })
    ).toBeChecked()
    await usuario.click(within(tipos).getByRole("radio", { name: /^RUT/ }))
    expect(onTipo).toHaveBeenCalledWith("RUT")
    expect(
      within(hoja).getByRole("button", { name: "Elegir archivo" })
    ).toBeInTheDocument()
  })

  it("con el archivo elegido lo sube, avisa y cierra la hoja", async () => {
    const datos = carga({ elegido: PDF })
    const { usuario, onAbiertaChange } = renderizar(datos)
    const hoja = screen.getByRole("dialog", { name: "Cargar documento" })
    expect(within(hoja).getByText("camara.pdf")).toBeInTheDocument()
    await usuario.click(
      within(hoja).getByRole("button", { name: "Subir documento" })
    )
    await waitFor(() => expect(onAbiertaChange).toHaveBeenCalledWith(false))
    expect(datos.subir).toHaveBeenCalledOnce()
    expect(avisos.success).toHaveBeenCalledWith("Documento cargado", {
      description: "Cámara de Comercio de Café del Sur: queda por revisar.",
    })
  })

  it("si la subida no termina, la hoja sigue abierta", async () => {
    const datos = carga({ elegido: PDF, subir: vi.fn(async () => null) })
    const { usuario, onAbiertaChange } = renderizar(datos)
    await usuario.click(screen.getByRole("button", { name: "Subir documento" }))
    expect(datos.subir).toHaveBeenCalledOnce()
    expect(onAbiertaChange).not.toHaveBeenCalled()
    expect(avisos.success).not.toHaveBeenCalled()
  })

  it("mientras sube no cambia el tipo y solo ofrece cancelar", async () => {
    const datos = carga({
      elegido: PDF,
      instantanea: { estado: "subiendo", progreso: 0.4 },
    })
    const { usuario } = renderizar(datos)
    const hoja = screen.getByRole("dialog", { name: "Cargar documento" })
    for (const radio of within(hoja).getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-disabled", "true")
    }
    expect(
      within(hoja).queryByRole("button", { name: "Subir documento" })
    ).not.toBeInTheDocument()
    expect(within(hoja).getByRole("status")).toHaveTextContent(
      /no cierres esta ventana/
    )
    await usuario.click(
      within(hoja).getByRole("button", { name: "Cancelar subida" })
    )
    expect(datos.subida.cancelar).toHaveBeenCalledOnce()
  })
})
