import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OpcionesSubida } from "@/components/archivos/motor-subida"
import type { ArchivoSubido, DescripcionArchivo } from "@/lib/archivos/tipos"
import { exito } from "@/lib/result"

import type { TipoDocumentoAnunciante } from "../requisitos"
import type { DocumentoExpediente } from "../tipos"

const acciones = vi.hoisted(() => ({
  prepararCargaDocumentoAnunciante: vi.fn(),
  confirmarCargaDocumentoAnunciante: vi.fn(),
}))
vi.mock("../actions", () => acciones)

/** `useSubida` falso: guarda las opciones y resuelve la subida al instante. */
const subida = vi.hoisted(() => ({
  opciones: null as OpcionesSubida<unknown> | null,
  subir: vi.fn(),
  reintentar: vi.fn(),
  reiniciar: vi.fn(),
}))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: (opciones: OpcionesSubida<unknown>) => {
    subida.opciones = opciones
    return {
      estado: "en-cola",
      progreso: 0,
      error: null,
      intento: 0,
      reanudaEn: null,
      subir: subida.subir,
      reintentar: subida.reintentar,
      cancelar: vi.fn(),
      reiniciar: subida.reiniciar,
      activa: false,
    }
  },
}))

import { useCargaInterna } from "./use-carga-interna"

const EMPRESA = "0192f3a4-5b6c-7d8e-9f01-0000000000aa"

const DESCRIPCION: DescripcionArchivo = {
  nombre: "rut.pdf",
  tipo: "application/pdf",
  tamano: 1000,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: false,
}

const SUBIDO: ArchivoSubido = {
  ...DESCRIPCION,
  bucket: "documentos",
  ruta: `anunciante/${EMPRESA}/RUT/0192f3a4-5b6c-7d8e-9f01-0000000000ff.pdf`,
  rutaMiniatura: null,
}

const REGISTRADO: DocumentoExpediente = {
  id: "0192f3a4-5b6c-7d8e-9f01-000000000001",
  tipo: "RUT",
  estado: "PENDIENTE",
  venceAt: null,
  subidoAt: "2026-10-22T15:00:00.000Z",
  observaciones: null,
  validadoAt: null,
  mime: "application/pdf",
}

const PDF = new File(["%PDF-1.4"], "rut.pdf", { type: "application/pdf" })
const FOTO = new File(["x"], "rut.jpg", { type: "image/jpeg" })

beforeEach(() => {
  for (const accion of Object.values(acciones)) accion.mockReset()
  subida.subir.mockReset()
  subida.reintentar.mockReset()
  subida.reiniciar.mockReset()
  subida.opciones = null
  globalThis.URL.createObjectURL = vi.fn(() => "blob:vista")
  globalThis.URL.revokeObjectURL = vi.fn()
})

function montar(tipo: TipoDocumentoAnunciante = "RUT") {
  return renderHook(
    ({ tipo: actual }: { tipo: TipoDocumentoAnunciante }) =>
      useCargaInterna(EMPRESA, actual),
    { initialProps: { tipo } }
  )
}

describe("useCargaInterna", () => {
  it("prepara y confirma con la empresa y el tipo elegido, comprimiendo las fotos", async () => {
    const { rerender } = montar("RUT")
    expect(subida.opciones?.comprimir).toBeTruthy()
    expect(subida.opciones?.reglas?.maxBytes).toBe(10 * 1024 * 1024)

    rerender({ tipo: "CAMARA_COMERCIO" })
    acciones.prepararCargaDocumentoAnunciante.mockResolvedValue(exito({}))
    acciones.confirmarCargaDocumentoAnunciante.mockResolvedValue(
      exito(REGISTRADO)
    )
    await subida.opciones?.preparar(DESCRIPCION)
    await subida.opciones?.confirmar(SUBIDO)
    expect(acciones.prepararCargaDocumentoAnunciante).toHaveBeenCalledWith({
      anuncianteId: EMPRESA,
      tipo: "CAMARA_COMERCIO",
      archivo: DESCRIPCION,
    })
    expect(acciones.confirmarCargaDocumentoAnunciante).toHaveBeenCalledWith({
      anuncianteId: EMPRESA,
      tipo: "CAMARA_COMERCIO",
      archivo: SUBIDO,
    })
  })

  it("una foto se revisa antes de subir; un PDF no tiene vista previa", () => {
    const { result } = montar()
    act(() => result.current.elegir(FOTO))
    expect(result.current.elegido).toBe(FOTO)
    expect(result.current.vistaPrevia).toBe("blob:vista")
    act(() => result.current.elegir(PDF))
    expect(result.current.vistaPrevia).toBeNull()
    // La vista previa anterior se libera.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:vista")
  })

  it("subir devuelve el documento registrado y suelta el archivo", async () => {
    subida.subir.mockResolvedValue({
      ok: true,
      datos: REGISTRADO,
      archivo: SUBIDO,
    })
    const { result } = montar()
    act(() => result.current.elegir(PDF))
    let documento: DocumentoExpediente | null = null
    await act(async () => {
      documento = await result.current.subir()
    })
    expect(subida.subir).toHaveBeenCalledWith(PDF)
    expect(documento).toEqual(REGISTRADO)
    expect(result.current.elegido).toBeNull()
  })

  it("si la subida falla conserva el archivo para reintentar", async () => {
    subida.subir.mockResolvedValue({
      ok: false,
      error: "El archivo no terminó de subir.",
      cancelada: false,
    })
    const { result } = montar()
    act(() => result.current.elegir(PDF))
    let documento: DocumentoExpediente | null = REGISTRADO
    await act(async () => {
      documento = await result.current.subir()
    })
    expect(documento).toBeNull()
    expect(result.current.elegido).toBe(PDF)

    subida.reintentar.mockResolvedValue({
      ok: true,
      datos: REGISTRADO,
      archivo: SUBIDO,
    })
    await act(async () => {
      documento = await result.current.reintentar()
    })
    expect(documento).toEqual(REGISTRADO)
    expect(result.current.elegido).toBeNull()
  })

  it("sin archivo elegido no sube nada", async () => {
    const { result } = montar()
    await act(async () => {
      expect(await result.current.subir()).toBeNull()
    })
    expect(subida.subir).not.toHaveBeenCalled()
  })
})
