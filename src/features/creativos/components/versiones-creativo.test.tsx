import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { MENSAJES_CREATIVO } from "../errores"
import {
  archivoPrueba,
  datosPrueba,
  FORMATOS_PRUEBA,
  OFERTA_ID,
  versionPrueba,
} from "../fixtures"
import { VersionesCreativo } from "./versiones-creativo"

const simulados = vi.hoisted(() => ({
  leerCreativoEditable: vi.fn(),
  crearVersionPendiente: vi.fn(),
  activarVersionCreativo: vi.fn(),
  descartarVersionPendiente: vi.fn(),
  firmarArchivoCreativo: vi.fn(),
  firmarArchivosVersion: vi.fn(),
}))

vi.mock("../actions", () => ({
  leerCreativoEditable: simulados.leerCreativoEditable,
  crearVersionPendiente: simulados.crearVersionPendiente,
  activarVersionCreativo: simulados.activarVersionCreativo,
  descartarVersionPendiente: simulados.descartarVersionPendiente,
  firmarArchivoCreativo: simulados.firmarArchivoCreativo,
  firmarArchivosVersion: simulados.firmarArchivosVersion,
  guardarCreativo: vi.fn(),
  prepararArchivoCreativo: vi.fn(),
  confirmarArchivoCreativo: vi.fn(),
  quitarArchivoCreativo: vi.fn(),
  ordenarArchivosCreativo: vi.fn(),
}))

// La cola real sube a Storage; aquí la versión pendiente ya tiene su archivo.
vi.mock("@/components/archivos/use-subidas", () => ({
  useSubidas: () => ({
    elementos: [],
    agregar: vi.fn(),
    reintentar: vi.fn(),
    cancelar: vi.fn(),
    quitar: vi.fn(),
    quitarCompletadas: vi.fn(),
    ocupadas: false,
  }),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

function nuevoCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function conConsultas(hijo: ReactNode, cliente = nuevoCliente()) {
  return <QueryClientProvider client={cliente}>{hijo}</QueryClientProvider>
}

const V1 = versionPrueba({
  id: "01a16525-58df-7261-945f-fdec04e83e71",
  version: 1,
  vigente: false,
  activadoAt: "2026-10-18T15:00:00+00:00",
})
const V2 = versionPrueba({
  id: "01a16525-58df-7261-945f-fdec04e83e72",
  version: 2,
  archivos: [archivoPrueba()],
})
const V3 = versionPrueba({
  id: "01a16525-58df-7261-945f-fdec04e83e73",
  version: 3,
  vigente: false,
  pendiente: true,
  activadoAt: null,
  archivos: [archivoPrueba()],
})

beforeEach(() => {
  vi.clearAllMocks()
  simulados.firmarArchivoCreativo.mockResolvedValue(
    exito({ url: "https://storage.test/x", vigenciaSegundos: 300 })
  )
  simulados.firmarArchivosVersion.mockResolvedValue(
    exito({ archivos: {}, vigenciaSegundos: 300 })
  )
})

describe("VersionesCreativo", () => {
  it("muestra la vigente y el historial plegado", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(datosPrueba({ estadoOferta: "BORRADOR", vigente: V2 }))
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V2, V1]}
          puedeVersionar={false}
        />
      )
    )
    const vigente = screen.getByRole("article", { name: "Versión 2" })
    expect(within(vigente).getByText("Vigente")).toBeInTheDocument()
    const historial = screen.getByRole("region", {
      name: "Versiones anteriores",
    })
    expect(within(historial).getByText("Reemplazada")).toBeInTheDocument()
    await usuario.click(within(historial).getByRole("button", { name: "Ver" }))
    expect(
      within(historial).getByRole("region", {
        name: "Archivos de la versión 1",
      })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Preparar versión nueva" })
    ).toBeNull()
  })

  it("en una publicada prepara la versión nueva partiendo de la vigente", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "PUBLICADA",
          vigente: V2,
          bloqueo: MENSAJES_CREATIVO.publicada,
          admiteVersionNueva: true,
        })
      )
    )
    simulados.crearVersionPendiente.mockResolvedValue(
      exito({ version: V3, aviso: null })
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V2]}
          puedeVersionar
        />
      )
    )
    await usuario.click(
      await screen.findByRole("button", { name: "Preparar versión nueva" })
    )
    const dialogo = await screen.findByRole("dialog", {
      name: "Preparar la versión 3",
    })
    expect(
      within(dialogo).getByRole("radio", { name: /Partir de la versión 2/ })
    ).toBeChecked()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Preparar versión" })
    )
    await waitFor(() =>
      expect(simulados.crearVersionPendiente).toHaveBeenCalledWith({
        ofertaId: OFERTA_ID,
        conservar: true,
        tipo: undefined,
      })
    )
  })

  it("desde cero en un post pide el tipo", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "PUBLICADA",
          formato: FORMATOS_PRUEBA.postFeed,
          vigente: { ...V2, tipo: "IMAGEN" },
          bloqueo: MENSAJES_CREATIVO.publicada,
          admiteVersionNueva: true,
        })
      )
    )
    simulados.crearVersionPendiente.mockResolvedValue(
      exito({ version: V3, aviso: null })
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[{ ...V2, tipo: "IMAGEN" }]}
          puedeVersionar
        />
      )
    )
    await usuario.click(
      await screen.findByRole("button", { name: "Preparar versión nueva" })
    )
    const dialogo = await screen.findByRole("dialog")
    await usuario.click(
      within(dialogo).getByRole("radio", { name: /Empezar desde cero/ })
    )
    await usuario.click(within(dialogo).getByRole("radio", { name: "Video" }))
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Preparar versión" })
    )
    await waitFor(() =>
      expect(simulados.crearVersionPendiente).toHaveBeenCalledWith({
        ofertaId: OFERTA_ID,
        conservar: false,
        tipo: "VIDEO",
      })
    )
  })

  it("la pendiente se activa con confirmación cuando está completa", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "PUBLICADA",
          vigente: V2,
          editable: V3,
        })
      )
    )
    simulados.activarVersionCreativo.mockResolvedValue(
      exito({ version: 3, reemplazaA: V2.id })
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar
        />
      )
    )
    const pendiente = screen.getByRole("article", { name: "Versión 3" })
    expect(within(pendiente).getByText("En preparación")).toBeInTheDocument()
    const activar = await within(pendiente).findByRole("button", {
      name: "Activar versión 3",
    })
    await waitFor(() => expect(activar).toBeEnabled())
    await usuario.click(activar)
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Activar la versión 3?",
    })
    expect(dialogo).toHaveTextContent(
      "La versión 2 deja de estar vigente y los medios que ya aceptaron la oferta reciben un aviso"
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Activar versión" })
    )
    await waitFor(() =>
      expect(simulados.activarVersionCreativo).toHaveBeenCalledWith({
        creativoId: V3.id,
      })
    )
    // El botón desaparece con la versión: el foco va al título de la vigente.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Versión 2" })).toHaveFocus()
    )
  })

  it("la pendiente se descarta con confirmación; la vigente sigue", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "PUBLICADA",
          vigente: V2,
          editable: V3,
        })
      )
    )
    simulados.descartarVersionPendiente.mockResolvedValue(
      exito({ creativoId: V3.id, version: 3 })
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar
        />
      )
    )
    const pendiente = screen.getByRole("article", { name: "Versión 3" })
    const descartar = await within(pendiente).findByRole("button", {
      name: "Descartar",
    })
    expect(descartar).toHaveAccessibleDescription("Versión 3")
    await usuario.click(descartar)
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Descartar la versión 3?",
    })
    expect(dialogo).toHaveTextContent(
      "Se borran sus archivos y textos. Los medios siguen con la versión 2, que no cambia. No se puede deshacer."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar versión" })
    )
    await waitFor(() =>
      expect(simulados.descartarVersionPendiente).toHaveBeenCalledWith({
        creativoId: V3.id,
      })
    )
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Versión 2" })).toHaveFocus()
    )
    expect(toast.success).toHaveBeenCalledWith(
      "Versión 3 descartada",
      expect.objectContaining({
        description: "Los medios siguen con la versión 2.",
      })
    )
    expect(simulados.activarVersionCreativo).not.toHaveBeenCalled()
  })

  it("si no se puede descartar, el motivo queda en el diálogo", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "PUBLICADA",
          vigente: V2,
          editable: V3,
        })
      )
    )
    simulados.descartarVersionPendiente.mockResolvedValue(
      fallo(MENSAJES_CREATIVO.noEditable)
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar
        />
      )
    )
    await usuario.click(
      await screen.findByRole("button", { name: "Descartar" })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar versión" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      MENSAJES_CREATIVO.noEditable
    )
    expect(toast.success).not.toHaveBeenCalled()
    // Al cancelar, el foco vuelve a «Descartar», que sigue ahí.
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Descartar" })).toHaveFocus()
    )
  })

  it("al preparar, el foco pasa al título de la versión nueva", async () => {
    const usuario = userEvent.setup()
    simulados.leerCreativoEditable
      .mockResolvedValueOnce(
        exito(
          datosPrueba({
            estadoOferta: "PUBLICADA",
            vigente: V2,
            bloqueo: MENSAJES_CREATIVO.publicada,
            admiteVersionNueva: true,
          })
        )
      )
      .mockResolvedValue(
        exito(
          datosPrueba({ estadoOferta: "PUBLICADA", vigente: V2, editable: V3 })
        )
      )
    simulados.crearVersionPendiente.mockResolvedValue(
      exito({ version: V3, aviso: null })
    )
    const cliente = nuevoCliente()
    const { rerender } = render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V2]}
          puedeVersionar
        />,
        cliente
      )
    )
    await usuario.click(
      await screen.findByRole("button", { name: "Preparar versión nueva" })
    )
    await usuario.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Preparar versión",
      })
    )
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    // El refresco de la página trae la versión en preparación.
    rerender(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar
        />,
        cliente
      )
    )
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Versión 3" })).toHaveFocus()
    )
  })

  it("con la empresa suspendida no ofrece activar y explica por qué", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "EN_EJECUCION",
          vigente: V2,
          editable: V3,
          bloqueoActivacion: MENSAJES_CREATIVO.empresaSuspendida,
        })
      )
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar
        />
      )
    )
    const pendiente = screen.getByRole("article", { name: "Versión 3" })
    expect(
      await within(pendiente).findByText(MENSAJES_CREATIVO.empresaSuspendida)
    ).toBeInTheDocument()
    expect(
      within(pendiente).getByRole("button", { name: "Descartar" })
    ).toBeInTheDocument()
    expect(
      within(pendiente).queryByRole("button", { name: /Activar versión/ })
    ).toBeNull()
  })

  it("sin empresa verificada, avisa antes de preparar la versión nueva", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(
        datosPrueba({
          estadoOferta: "PUBLICADA",
          vigente: V2,
          bloqueo: MENSAJES_CREATIVO.publicada,
          admiteVersionNueva: true,
          bloqueoActivacion: MENSAJES_CREATIVO.empresaSinVerificar,
        })
      )
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V2]}
          puedeVersionar
        />
      )
    )
    expect(
      await screen.findByRole("button", { name: "Preparar versión nueva" })
    ).toBeInTheDocument()
    expect(
      screen.getByText(MENSAJES_CREATIVO.empresaSinVerificar)
    ).toBeInTheDocument()
  })

  it("mientras carga lo dice y, si falla, explica y deja reintentar", async () => {
    const usuario = userEvent.setup()
    const sinRed = fallo("No hay conexión con el servidor.")
    let responder: (valor: unknown) => void = () => undefined
    simulados.leerCreativoEditable
      .mockImplementationOnce(
        () =>
          new Promise((resolver) => {
            responder = resolver
          })
      )
      // La consulta reintenta una vez antes de darse por fallida.
      .mockResolvedValueOnce(sinRed)
      .mockResolvedValueOnce(
        exito(
          datosPrueba({
            estadoOferta: "PUBLICADA",
            vigente: V2,
            bloqueo: MENSAJES_CREATIVO.publicada,
            admiteVersionNueva: true,
          })
        )
      )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V2]}
          puedeVersionar
        />
      )
    )
    expect(
      screen.getByText("Cargando las opciones del creativo…")
    ).toBeInTheDocument()
    responder(sinRed)
    const error = await screen.findByRole("alert", {}, { timeout: 3000 })
    expect(error).toHaveTextContent(
      "No pudimos revisar si puedes cambiar el creativo"
    )
    expect(error).toHaveTextContent("No hay conexión con el servidor.")
    await usuario.click(
      within(error).getByRole("button", { name: "Reintentar" })
    )
    expect(
      await screen.findByRole("button", { name: "Preparar versión nueva" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("si no se puede leer la versión en preparación, lo explica", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(
      fallo("No hay conexión con el servidor.")
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar
        />
      )
    )
    const pendiente = screen.getByRole("article", { name: "Versión 3" })
    expect(
      await within(pendiente).findByRole("alert", {}, { timeout: 3000 })
    ).toHaveTextContent("No pudimos cargar la versión en preparación")
    expect(
      within(pendiente).getByRole("button", { name: "Reintentar" })
    ).toBeInTheDocument()
  })

  it("sin permiso para versionar, la pendiente no se descarta", async () => {
    simulados.leerCreativoEditable.mockResolvedValue(
      exito(datosPrueba({ estadoOferta: "PUBLICADA", vigente: V2 }))
    )
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[V3, V2]}
          puedeVersionar={false}
        />
      )
    )
    expect(
      await screen.findByRole("article", { name: "Versión 3" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull()
  })

  it("sin versiones invita a cargar el paquete", () => {
    simulados.leerCreativoEditable.mockResolvedValue(exito(datosPrueba()))
    render(
      conConsultas(
        <VersionesCreativo
          ofertaId={OFERTA_ID}
          versiones={[]}
          puedeVersionar={false}
        />
      )
    )
    expect(screen.getByText("Aún no hay paquete creativo")).toBeInTheDocument()
  })
})
