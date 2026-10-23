import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MIB } from "@/lib/archivos/formato"
import { exito, fallo } from "@/lib/result"

import { MENSAJES_CREATIVO } from "../errores"
import {
  archivoPrueba,
  CREATIVO_ID,
  datosPrueba,
  FORMATOS_PRUEBA,
  OFERTA_ID,
  versionPrueba,
} from "../fixtures"
import { FALTAS } from "../paquete"
import { PanelCreativo } from "./panel-creativo"

const simulados = vi.hoisted(() => ({
  leerCreativoEditable: vi.fn(),
  guardarCreativo: vi.fn(),
  prepararArchivoCreativo: vi.fn(),
  confirmarArchivoCreativo: vi.fn(),
  quitarArchivoCreativo: vi.fn(),
  ordenarArchivosCreativo: vi.fn(),
  firmarArchivoCreativo: vi.fn(),
  firmarArchivosVersion: vi.fn(),
  dimensiones: { ancho: 1080, alto: 1920 },
  agregar: vi.fn(),
  opcionesSubidas: null as null | {
    preparar: (descripcion: unknown) => Promise<unknown>
  },
}))

vi.mock("../actions", () => ({
  leerCreativoEditable: simulados.leerCreativoEditable,
  guardarCreativo: simulados.guardarCreativo,
  prepararArchivoCreativo: simulados.prepararArchivoCreativo,
  confirmarArchivoCreativo: simulados.confirmarArchivoCreativo,
  quitarArchivoCreativo: simulados.quitarArchivoCreativo,
  ordenarArchivosCreativo: simulados.ordenarArchivosCreativo,
  firmarArchivoCreativo: simulados.firmarArchivoCreativo,
  firmarArchivosVersion: simulados.firmarArchivosVersion,
}))

// jsdom no decodifica imágenes ni videos: las medidas las dicta la prueba.
vi.mock("@/lib/archivos/medios", () => ({
  leerDimensiones: vi.fn(async () => simulados.dimensiones),
  leerDuracionVideo: vi.fn(async () => 30),
  cuadroDeVideo: vi.fn(),
}))

// La cola real sube a Storage: aquí solo se registra lo que se encola.
vi.mock("@/components/archivos/use-subidas", () => ({
  useSubidas: (opciones: typeof simulados.opcionesSubidas) => {
    simulados.opcionesSubidas = opciones
    return {
      elementos: [],
      agregar: simulados.agregar,
      reintentar: vi.fn(),
      cancelar: vi.fn(),
      quitar: vi.fn(),
      quitarCompletadas: vi.fn(),
      ocupadas: false,
    }
  },
}))

function conConsultas(hijo: ReactNode) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={cliente}>{hijo}</QueryClientProvider>
}

function video(nombre = "reel.mp4") {
  return new File([new Uint8Array(1024)], nombre, { type: "video/mp4" })
}

function elegir(archivos: File[]) {
  const entrada = document.querySelector<HTMLInputElement>(
    'input[type="file"]:not([capture])'
  )
  if (!entrada) throw new Error("Sin zona de archivos")
  fireEvent.change(entrada, { target: { files: archivos } })
}

beforeEach(() => {
  vi.clearAllMocks()
  simulados.dimensiones = { ancho: 1080, alto: 1920 }
  simulados.firmarArchivosVersion.mockResolvedValue(
    exito({ archivos: {}, vigenciaSegundos: 300 })
  )
})

describe("PanelCreativo", () => {
  it("carga la oferta y muestra lo que pide el formato", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(exito(datosPrueba()))
    const alCambiar = vi.fn()
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.reel}
          editable
          alCambiar={alCambiar}
        />
      )
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando el paquete creativo…"
    )
    expect(
      await screen.findByText("Lo que pide un reel de Instagram")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("region", {
        name: "Paquete creativo: Reel de Instagram",
      })
    ).toBeInTheDocument()
    expect(screen.getByText(/Video vertical 9:16/)).toBeInTheDocument()
    await waitFor(() =>
      expect(alCambiar).toHaveBeenLastCalledWith({
        listo: false,
        archivos: 0,
        faltan: [FALTAS.sinArchivos],
      })
    )
  })

  it("rechaza un video horizontal para un reel indicando 9:16, sin subirlo", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(exito(datosPrueba()))
    simulados.dimensiones = { ancho: 1920, alto: 1080 }
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.reel}
          editable
        />
      )
    )
    await screen.findByText("Lo que pide un reel de Instagram")
    elegir([video("horizontal.mp4")])
    expect(
      await screen.findByText(
        /Un reel de Instagram necesita video vertical 9:16.*el tuyo es horizontal 16:9/
      )
    ).toBeInTheDocument()
    expect(simulados.guardarCreativo).not.toHaveBeenCalled()
    expect(simulados.agregar).not.toHaveBeenCalled()
  })

  it("crea la versión antes de subir y sube a ella", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(exito(datosPrueba()))
    simulados.guardarCreativo.mockResolvedValue(
      exito(versionPrueba({ archivos: [] }))
    )
    simulados.prepararArchivoCreativo.mockResolvedValue(fallo("x"))
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.reel}
          editable
        />
      )
    )
    await screen.findByText("Lo que pide un reel de Instagram")
    const archivo = video()
    elegir([archivo])
    await waitFor(() =>
      expect(simulados.agregar).toHaveBeenCalledWith([archivo])
    )
    expect(simulados.guardarCreativo).toHaveBeenCalledWith({
      ofertaId: OFERTA_ID,
      tipo: "VIDEO",
    })
    await simulados.opcionesSubidas?.preparar({ nombre: "reel.mp4" })
    expect(simulados.prepararArchivoCreativo).toHaveBeenCalledWith({
      ofertaId: OFERTA_ID,
      creativoId: CREATIVO_ID,
      archivo: { nombre: "reel.mp4" },
    })
  })

  it("quita un archivo tras confirmarlo", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          editable: versionPrueba({
            archivos: [archivoPrueba({ id: "a", tamanoBytes: 12 * MIB })],
          }),
        })
      )
    )
    simulados.quitarArchivoCreativo.mockResolvedValue(
      exito({ creativoId: CREATIVO_ID })
    )
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.reel}
          editable
        />
      )
    )
    const cargados = await screen.findByRole("list", {
      name: "Archivos cargados",
    })
    expect(
      within(cargados).getByText(/MP4 · 1080 × 1920 px/)
    ).toBeInTheDocument()
    expect(
      screen.getByText("Para cambiar el archivo, quita el actual y sube otro.")
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: "Quitar video" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Quitar video?",
    })
    await usuario.click(within(dialogo).getByRole("button", { name: "Quitar" }))
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Archivos cargados" })
      ).toBeNull()
    )
    expect(simulados.quitarArchivoCreativo).toHaveBeenCalledWith({
      archivoId: "a",
    })
  })

  it("un post con archivos no deja cambiar el tipo y lo explica", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          formato: FORMATOS_PRUEBA.postFeed,
          editable: versionPrueba({
            tipo: "IMAGEN",
            archivos: [
              archivoPrueba({ mime: "image/jpeg", ancho: 1080, alto: 1080 }),
            ],
          }),
        })
      )
    )
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.postFeed}
          editable
        />
      )
    )
    const grupo = await screen.findByRole("group", {
      name: "¿Qué vas a publicar?",
    })
    expect(within(grupo).getByRole("radio", { name: /Imagen/ })).toBeChecked()
    expect(within(grupo).getByRole("radio", { name: /Video/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    expect(grupo).toHaveAccessibleDescription(
      "Para cambiar el tipo, primero quita los archivos cargados."
    )
  })

  it("en revisión muestra la vigente y por qué no se edita", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "EN_REVISION",
          vigente: versionPrueba(),
          bloqueo: MENSAJES_CREATIVO.enRevision,
        })
      )
    )
    const alCambiar = vi.fn()
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.reel}
          editable
          alCambiar={alCambiar}
        />
      )
    )
    expect(
      await screen.findByText(MENSAJES_CREATIVO.enRevision)
    ).toBeInTheDocument()
    expect(
      screen.getByText("Conoce la promoción de temporada.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Elegir archivo" })).toBeNull()
    expect(alCambiar).toHaveBeenCalledWith(
      expect.objectContaining({ listo: false })
    )
  })

  it("si no carga, explica y deja reintentar", async () => {
    const usuario = userEvent.setup()
    // La consulta reintenta una vez sola antes de mostrar el error.
    simulados.leerCreativoEditable
      .mockResolvedValueOnce(fallo(MENSAJES_CREATIVO.ofertaNoEncontrada))
      .mockResolvedValueOnce(fallo(MENSAJES_CREATIVO.ofertaNoEncontrada))
      .mockResolvedValueOnce(exito(datosPrueba()))
    render(
      conConsultas(
        <PanelCreativo
          ofertaId={OFERTA_ID}
          formato={FORMATOS_PRUEBA.reel}
          editable
        />
      )
    )
    expect(
      await screen.findByText(
        MENSAJES_CREATIVO.ofertaNoEncontrada,
        {},
        { timeout: 4000 }
      )
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(
      await screen.findByText("Lo que pide un reel de Instagram")
    ).toBeInTheDocument()
  })
})
