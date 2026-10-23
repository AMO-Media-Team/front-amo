import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { Situacion } from "../situacion"
import type { DocumentoAnunciante } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  prepararSubidaDocumentoAnunciante: vi.fn(),
  confirmarDocumentoAnunciante: vi.fn(),
  firmarDocumentoAnunciante: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// El transporte real (Supabase, TUS) no se usa: aquí no se sube nada.
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { TarjetaDocumentoAnunciante } from "./tarjeta-documento"

const ID = "0192f1c2-5b6a-7d00-8000-0000000000aa"

function documento(
  cambios: Partial<DocumentoAnunciante> = {}
): DocumentoAnunciante {
  return {
    id: ID,
    tipo: "CAMARA_COMERCIO",
    estado: "PENDIENTE",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-10-01T15:00:00Z",
    revisadoAt: null,
    formato: "application/pdf",
    ...cambios,
  }
}

function dibujar(
  situacion: Situacion,
  {
    tipo = "CAMARA_COMERCIO",
    pais = "CO",
    exigido = true,
  }: {
    tipo?: DocumentoAnunciante["tipo"]
    pais?: string
    exigido?: boolean
  } = {}
) {
  const onActividad = vi.fn()
  render(
    <ul>
      <TarjetaDocumentoAnunciante
        tipo={tipo}
        pais={pais}
        situacion={situacion}
        exigido={exigido}
        onActividad={onActividad}
      />
    </ul>
  )
  return { onActividad }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("TarjetaDocumentoAnunciante", () => {
  it("sin cargar explica qué es, pide atención y avisa que está libre", () => {
    const { onActividad } = dibujar({ tipo: "falta" })
    const tarjeta = screen.getByRole("article", { name: "Cámara de Comercio" })
    expect(within(tarjeta).getByText("Sin cargar")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(/expedido hace menos de 30 días/)
    ).toBeVisible()
    expect(within(tarjeta).queryByRole("button", { name: "Ver" })).toBeNull()
    expect(
      within(tarjeta).getByRole("button", { name: "Cargar" })
    ).toBeEnabled()
    expect(onActividad).toHaveBeenCalledWith("CAMARA_COMERCIO", false)
  })

  it("en el exterior la Cámara se llama por su equivalente", () => {
    dibujar({ tipo: "falta" }, { pais: "US" })
    expect(
      screen.getByRole("article", { name: "Certificado de existencia" })
    ).toBeVisible()
  })

  it("un opcional sin cargar no pide atención", () => {
    dibujar({ tipo: "falta" }, { tipo: "CERT_BANCARIA", exigido: false })
    const tarjeta = screen.getByRole("article", {
      name: "Certificado bancario",
    })
    expect(within(tarjeta).getByText("Opcional")).toBeInTheDocument()
  })

  it("un aprobado con reemplazo rechazado muestra el motivo y sigue valiendo", () => {
    dibujar({
      tipo: "aprobado",
      documento: documento({ estado: "APROBADO" }),
      diasParaVencer: null,
      porVencer: false,
      reemplazoRechazado: documento({
        estado: "RECHAZADO",
        observaciones: "La Cámara de Comercio tiene más de 30 días",
      }),
    })
    const tarjeta = screen.getByRole("article", { name: "Cámara de Comercio" })
    expect(within(tarjeta).getByText("Aprobado")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(
        "Rechazamos tu reemplazo; sigue valiendo el aprobado"
      )
    ).toBeVisible()
    expect(
      within(tarjeta).getByText("La Cámara de Comercio tiene más de 30 días")
    ).toBeVisible()
    expect(
      within(tarjeta).getByRole("button", { name: "Reemplazar" })
    ).toBeEnabled()
  })

  it("«Ver» pide la URL firmada de SU fila al abrir el visor", async () => {
    acciones.firmarDocumentoAnunciante.mockResolvedValue(
      exito({ url: "https://firmada.test/camara.pdf", vigenciaSegundos: 300 })
    )
    dibujar({
      tipo: "en-revision",
      documento: documento(),
      vigente: null,
    })
    const tarjeta = screen.getByRole("article", { name: "Cámara de Comercio" })
    expect(within(tarjeta).getByText("En revisión")).toBeInTheDocument()
    expect(acciones.firmarDocumentoAnunciante).not.toHaveBeenCalled()
    await userEvent.click(within(tarjeta).getByRole("button", { name: "Ver" }))
    expect(
      await screen.findByRole("dialog", { name: "Cámara de Comercio" })
    ).toBeVisible()
    await waitFor(() =>
      expect(acciones.firmarDocumentoAnunciante).toHaveBeenCalledWith({
        documentoId: ID,
      })
    )
  })
})
