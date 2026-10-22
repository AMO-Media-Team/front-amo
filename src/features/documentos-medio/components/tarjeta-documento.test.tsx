import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatearFecha } from "@/lib/format"

import type { Situacion } from "../situacion"
import type { DocumentoCargado } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  prepararSubidaDocumento: vi.fn(),
  confirmarDocumento: vi.fn(),
  firmarDocumento: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// El transporte real (Supabase, TUS) no se usa: aquí no se sube nada.
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { TarjetaDocumento } from "./tarjeta-documento"

function documento(cambios: Partial<DocumentoCargado> = {}): DocumentoCargado {
  return {
    id: "0192f1c2-5b6a-7d00-8000-0000000000aa",
    tipo: "CEDULA_FRENTE",
    estado: "PENDIENTE",
    metodo: "ARCHIVO",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-10-01T15:00:00Z",
    revisadoAt: null,
    formato: "image/webp",
    ...cambios,
  }
}

function dibujar(
  tipo: DocumentoCargado["tipo"],
  situacion: Situacion,
  onActividad = vi.fn()
) {
  render(
    <ul>
      <TarjetaDocumento
        tipo={tipo}
        situacion={situacion}
        onActividad={onActividad}
      />
    </ul>
  )
  return { onActividad }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("TarjetaDocumento", () => {
  it("un documento sin cargar explica qué es y ofrece cargarlo", async () => {
    const { onActividad } = dibujar("CEDULA_FRENTE", {
      tipo: "falta",
      deCuentaAnterior: false,
    })
    const tarjeta = screen.getByRole("article", {
      name: "Documento de identidad (frente)",
    })
    expect(within(tarjeta).getByText("Sin cargar")).toBeInTheDocument()
    expect(within(tarjeta).getByText(/donde aparecen tu foto/)).toBeVisible()
    expect(within(tarjeta).queryByRole("button", { name: "Ver" })).toBeNull()
    // Sin subida en curso: avisa a la lista que la tarjeta está libre.
    expect(onActividad).toHaveBeenCalledWith("CEDULA_FRENTE", false)

    await userEvent.click(
      within(tarjeta).getByRole("button", { name: "Cargar" })
    )
    const hoja = await screen.findByRole("dialog", {
      name: "Documento de identidad (frente)",
    })
    expect(
      within(hoja).getByRole("heading", {
        name: "Para que lo aprueben a la primera",
      })
    ).toBeVisible()
    expect(
      within(hoja).getByRole("button", { name: "Elegir archivo" })
    ).toBeVisible()
    expect(acciones.prepararSubidaDocumento).not.toHaveBeenCalled()
  })

  it("la prueba de vida se ofrece como opcional, con la alternativa de videollamada", async () => {
    dibujar("PRUEBA_VIDA", { tipo: "falta", deCuentaAnterior: false })
    const tarjeta = screen.getByRole("article", { name: "Prueba de vida" })
    expect(within(tarjeta).getByText("Opcional")).toBeInTheDocument()
    expect(within(tarjeta).getByText(/videollamada corta/)).toBeVisible()

    await userEvent.click(
      within(tarjeta).getByRole("button", { name: "Cargar" })
    )
    const hoja = await screen.findByRole("dialog", { name: "Prueba de vida" })
    expect(within(hoja).getByText("Enviarla es voluntario")).toBeVisible()
    expect(within(hoja).getByText(/dato biométrico/)).toBeVisible()
  })

  it("el certificado de la cuenta anterior pide el de la cuenta nueva", () => {
    dibujar("CERT_BANCARIA", { tipo: "falta", deCuentaAnterior: true })
    const tarjeta = screen.getByRole("article", {
      name: "Certificación bancaria",
    })
    expect(within(tarjeta).getByText("Sin cargar")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(
        "Cambiaste tu cuenta de pago: carga el certificado de la cuenta nueva."
      )
    ).toBeVisible()
    expect(
      within(tarjeta).getByRole("button", { name: "Cargar" })
    ).toBeVisible()
  })

  it("un rechazo muestra el motivo y pide cargarlo de nuevo", () => {
    dibujar("CEDULA_FRENTE", {
      tipo: "rechazado",
      documento: documento({
        estado: "RECHAZADO",
        observaciones: "La foto está borrosa: no se leen los datos.",
        revisadoAt: "2026-10-02T15:00:00Z",
      }),
    })
    const tarjeta = screen.getByRole("article", {
      name: "Documento de identidad (frente)",
    })
    expect(within(tarjeta).getByText("Rechazado")).toBeInTheDocument()
    expect(within(tarjeta).getByText("Motivo del rechazo")).toBeVisible()
    expect(
      within(tarjeta).getByText("La foto está borrosa: no se leen los datos.")
    ).toBeVisible()
    expect(
      within(tarjeta).getByRole("button", { name: "Cargar de nuevo" })
    ).toBeEnabled()
    expect(within(tarjeta).getByRole("button", { name: "Ver" })).toBeEnabled()
  })

  it("un aprobado por vencer avisa con los días y ofrece reemplazarlo", () => {
    dibujar("CERT_BANCARIA", {
      tipo: "aprobado",
      documento: documento({
        tipo: "CERT_BANCARIA",
        estado: "APROBADO",
        venceEl: "2026-11-01",
        formato: "application/pdf",
      }),
      diasParaVencer: 10,
      porVencer: true,
      reemplazoRechazado: null,
    })
    const tarjeta = screen.getByRole("article", {
      name: "Certificación bancaria",
    })
    expect(within(tarjeta).getByText("Vence en 10 días")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(/antes de que venza para no perder tu nivel/)
    ).toBeVisible()
    expect(
      within(tarjeta).getByRole("button", { name: "Reemplazar" })
    ).toBeEnabled()
  })

  it("la prueba de vida aprobada por videollamada no tiene archivo ni acciones", () => {
    dibujar("PRUEBA_VIDA", {
      tipo: "aprobado",
      documento: documento({
        tipo: "PRUEBA_VIDA",
        estado: "APROBADO",
        metodo: "VIDEOLLAMADA",
        revisadoAt: "2026-10-05T15:00:00Z",
        formato: null,
      }),
      diasParaVencer: null,
      porVencer: false,
      reemplazoRechazado: null,
    })
    const tarjeta = screen.getByRole("article", { name: "Prueba de vida" })
    expect(within(tarjeta).getByText("Aprobado")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(
        `Verificada por videollamada el ${formatearFecha("2026-10-05T15:00:00Z")}`
      )
    ).toBeVisible()
    expect(within(tarjeta).queryByRole("button")).toBeNull()
  })

  it("un reemplazo en revisión deja claro que el aprobado sigue valiendo", () => {
    dibujar("CEDULA_REVERSO", {
      tipo: "en-revision",
      documento: documento({ tipo: "CEDULA_REVERSO" }),
      vigente: documento({ tipo: "CEDULA_REVERSO", estado: "APROBADO" }),
    })
    const tarjeta = screen.getByRole("article", {
      name: "Documento de identidad (reverso)",
    })
    expect(
      within(tarjeta).getByText("Reemplazo en revisión")
    ).toBeInTheDocument()
    expect(
      within(tarjeta).getByText(/sigue valiendo el que ya estaba aprobado/)
    ).toBeVisible()
  })
})
