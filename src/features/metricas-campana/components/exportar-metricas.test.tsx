import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  prepararExportacionMetricas: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const exportadores = vi.hoisted(() => ({
  exportarExcel: vi.fn(),
  exportarPdf: vi.fn(),
  capturarGraficosReporte: vi.fn(),
}))
vi.mock("@/lib/export/excel", () => ({
  exportarExcel: exportadores.exportarExcel,
}))
vi.mock("@/lib/export/pdf", () => ({ exportarPdf: exportadores.exportarPdf }))
vi.mock("@/features/reportes/components/captura-reporte", () => ({
  capturarGraficosReporte: exportadores.capturarGraficosReporte,
}))
const avisos = vi.hoisted(() => ({
  loading: vi.fn(() => "aviso"),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: avisos }))

import { CAMPANA_METRICAS, datosMetricas } from "../fixtures"
import { ExportarMetricas } from "./exportar-metricas"

const ARCHIVO = {
  datos: datosMetricas(),
  dimension: "municipio" as const,
  generadoPor: "Ana Anunciante",
  generadoAt: "2026-10-22T15:00:00.000Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  exportadores.capturarGraficosReporte.mockResolvedValue({
    imagenes: [],
    fallidos: [],
  })
})

async function elegir(formato: RegExp) {
  const usuario = userEvent.setup()
  render(
    <ExportarMetricas
      campanaId={CAMPANA_METRICAS}
      dimension="municipio"
      sinResultados={false}
    />
  )
  await usuario.click(screen.getByRole("button", { name: "Exportar" }))
  await usuario.click(await screen.findByRole("menuitem", { name: formato }))
}

describe("ExportarMetricas", () => {
  it("el Excel lleva la portada de marca con la campaña y una hoja por corte", async () => {
    acciones.prepararExportacionMetricas.mockResolvedValue(exito(ARCHIVO))
    await elegir(/Excel/)

    await waitFor(() => expect(exportadores.exportarExcel).toHaveBeenCalled())
    expect(acciones.prepararExportacionMetricas).toHaveBeenCalledWith({
      campanaId: CAMPANA_METRICAS,
      formato: "xlsx",
      dimension: "municipio",
    })
    const [libro, nombre] = exportadores.exportarExcel.mock.calls[0]
    expect(nombre).toBe("metricas Temporada navideña")
    expect(libro.titulo).toBe("Métricas de campaña")
    expect(libro.filtros).toContainEqual({
      etiqueta: "Corte",
      valor: "Municipio",
    })
    expect(libro.generadoPor).toBe("Ana Anunciante")
    expect(avisos.success).toHaveBeenCalledWith("Excel descargado", {
      id: "aviso",
      description: expect.stringContaining("bitácora"),
    })
  })

  it("el PDF dibuja los gráficos en horizontal antes de armarse", async () => {
    acciones.prepararExportacionMetricas.mockResolvedValue(exito(ARCHIVO))
    await elegir(/PDF/)
    await waitFor(() => expect(exportadores.exportarPdf).toHaveBeenCalled())
    const [graficos, orientacion] =
      exportadores.capturarGraficosReporte.mock.calls[0]
    expect(graficos).toHaveLength(4)
    expect(orientacion).toBe("horizontal")
    const [documento] = exportadores.exportarPdf.mock.calls[0]
    expect(documento.secciones[0].tipo).toBe("indicadores")
  })

  it("si el servidor no lo permite, lo dice y no descarga nada", async () => {
    acciones.prepararExportacionMetricas.mockResolvedValue(
      fallo("No tienes permiso para consultar las métricas.")
    )
    await elegir(/Excel/)
    await waitFor(() =>
      expect(avisos.error).toHaveBeenCalledWith(
        "No tienes permiso para consultar las métricas.",
        { id: "aviso", description: undefined }
      )
    )
    expect(exportadores.exportarExcel).not.toHaveBeenCalled()
  })
})
