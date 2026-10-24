import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { TEXTO_SE_DECIDE_EN_DISPUTA } from "../decision"
import { MENSAJES_VALIDACION } from "../errores"
import type { EvidenciaEnCola } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ validarEvidencia: vi.fn() }))
vi.mock("../actions", () => acciones)
const firmas = vi.hoisted(() => ({ firmarEvidencias: vi.fn() }))
vi.mock("@/features/operacion/actions", () => firmas)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { RevisorEvidencias } from "./revisor-evidencias"

function evidencia(
  numero: number,
  cambios: Partial<EvidenciaEnCola> = {}
): EvidenciaEnCola {
  return {
    publicacionId: `0192f3a4-5b6c-7d8e-9f01-00000000000${numero}`,
    asignacionId: `0192f3a4-5b6c-7d8e-9f01-0000000000a${numero}`,
    numero: 1,
    publicaciones: 1,
    plataforma: "INSTAGRAM",
    formato: "Reel",
    urlPost: `https://www.instagram.com/reel/abc${numero}/`,
    fechaPublicacion: "2026-10-22T15:00:00Z",
    conImagen: false,
    enviadaAt: "2026-10-22T16:00:00Z",
    observacionesPrevias: null,
    etiquetaDeclarada: true,
    medio: {
      id: `0192f3a4-5b6c-7d8e-9f01-0000000000c${numero}`,
      nombre: `Medio ${numero}`,
      handle: `medio${numero}`,
    },
    cuentaUrl: `https://www.instagram.com/medio${numero}/`,
    oferta: {
      id: "0192f3a4-5b6c-7d8e-9f01-0000000000d1",
      titulo: "Reel de Halloween",
      marca: "Marca",
    },
    ventanaInicio: "2026-10-20T05:00:00Z",
    ventanaFin: "2026-10-30T05:00:00Z",
    permanenciaHasta: "2026-10-29T15:00:00Z",
    estadoAsignacion: "PUBLICADA",
    ...cambios,
  }
}

const EVIDENCIAS = [evidencia(1), evidencia(2)]

beforeEach(() => {
  acciones.validarEvidencia.mockReset().mockResolvedValue(
    exito({
      asignacionId: EVIDENCIAS[0].asignacionId,
      estadoAsignacion: "EVIDENCIA_VALIDADA",
      fechaLimitePublicacion: null,
    })
  )
  firmas.firmarEvidencias
    .mockReset()
    .mockResolvedValue(
      exito({ publicaciones: {}, metricas: {}, vigenciaSegundos: 300 })
    )
  avisos.success.mockReset()
})

async function abrirPrimera() {
  const usuario = userEvent.setup()
  render(<RevisorEvidencias evidencias={EVIDENCIAS} plazoRecargaHoras={24} />)
  await usuario.click(
    screen.getByRole("button", {
      name: "Revisar la evidencia de Medio 1: Reel de Halloween",
    })
  )
  const hoja = await screen.findByRole("dialog", {
    name: "Evidencia de Medio 1",
  })
  return { usuario, hoja }
}

describe("RevisorEvidencias (ADM-007)", () => {
  it("lista las evidencias con lo que se necesita para elegir", () => {
    render(<RevisorEvidencias evidencias={EVIDENCIAS} plazoRecargaHoras={24} />)
    const lista = screen.getByRole("list", { name: "Evidencias por validar" })
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2)
    expect(within(lista).getAllByText(/Medio 1 · @medio1/)).toHaveLength(1)
  })

  it("abre la publicación en otra pestaña y explica qué comprobar", async () => {
    const { hoja } = await abrirPrimera()
    const enlace = within(hoja).getByRole("link", {
      name: /Abrir la publicación/,
    })
    expect(enlace).toHaveAttribute("href", EVIDENCIAS[0].urlPost)
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(
      within(hoja).getByRole("heading", { name: "Qué comprobar" })
    ).toBeInTheDocument()
  })

  it("aprobar exige marcar la etiqueta de publicidad visible", async () => {
    const { usuario, hoja } = await abrirPrimera()
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    const casilla = within(hoja).getByRole("checkbox", {
      name: "La etiqueta de publicidad es visible",
    })
    await waitFor(() => expect(casilla).toHaveAttribute("aria-invalid", "true"))
    expect(casilla).toHaveAccessibleDescription(
      expect.stringContaining(MENSAJES_VALIDACION.etiquetaRequerida)
    )
    expect(acciones.validarEvidencia).not.toHaveBeenCalled()
  })

  it("al aprobar pasa a la siguiente y le da el foco a su título", async () => {
    const { usuario, hoja } = await abrirPrimera()
    await usuario.click(
      within(hoja).getByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
    )
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    expect(acciones.validarEvidencia).toHaveBeenCalledWith({
      aprobar: true,
      publicacionId: EVIDENCIAS[0].publicacionId,
      etiquetaVerificada: true,
      observaciones: "",
      enviadaAt: EVIDENCIAS[0].enviadaAt,
    })
    const siguiente = await screen.findByRole("dialog", {
      name: "Evidencia de Medio 2",
    })
    await waitFor(() =>
      expect(
        within(siguiente).getByRole("heading", { name: "Evidencia de Medio 2" })
      ).toHaveFocus()
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Evidencia aprobada: la asignación quedó con su evidencia validada",
      expect.anything()
    )
  })

  it("un error de la BD se muestra en la hoja, que sigue abierta", async () => {
    acciones.validarEvidencia.mockResolvedValue(
      fallo(MENSAJES_VALIDACION.asignacionCerrada)
    )
    const { usuario, hoja } = await abrirPrimera()
    await usuario.click(
      within(hoja).getByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
    )
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    expect(await within(hoja).findByRole("alert")).toHaveTextContent(
      MENSAJES_VALIDACION.asignacionCerrada
    )
  })

  it("si la asignación entró en disputa, la evidencia deja de decidirse y se explica", async () => {
    acciones.validarEvidencia.mockResolvedValue(
      fallo(MENSAJES_VALIDACION.enDisputaEvidencia)
    )
    const { usuario, hoja } = await abrirPrimera()
    await usuario.click(
      within(hoja).getByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
    )
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    const nota = await within(hoja).findByRole("note")
    expect(nota).toHaveTextContent(TEXTO_SE_DECIDE_EN_DISPUTA)
    expect(
      within(nota).getByRole("link", { name: "Ver la asignación y su disputa" })
    ).toHaveAttribute(
      "href",
      `/operacion/asignaciones/${EVIDENCIAS[0].asignacionId}`
    )
    for (const nombre of ["Aprobar", "Rechazar"]) {
      expect(
        within(hoja).queryByRole("button", { name: nombre })
      ).not.toBeInTheDocument()
    }
    await waitFor(() =>
      expect(
        within(hoja).getByRole("heading", { name: "Evidencia de Medio 1" })
      ).toHaveFocus()
    )
  })

  it("una evidencia de una asignación en disputa no ofrece decidirla", async () => {
    const usuario = userEvent.setup()
    render(
      <RevisorEvidencias
        evidencias={[evidencia(3, { estadoAsignacion: "EN_DISPUTA" })]}
        plazoRecargaHoras={24}
      />
    )
    await usuario.click(screen.getByRole("button", { name: /^Revisar/ }))
    const hoja = await screen.findByRole("dialog")
    expect(within(hoja).getByRole("note")).toHaveTextContent(
      TEXTO_SE_DECIDE_EN_DISPUTA
    )
    expect(
      within(hoja).queryByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
    ).not.toBeInTheDocument()
    expect(
      within(hoja).getByRole("link", { name: "Ver la asignación" })
    ).toBeInTheDocument()
  })

  it("rechazar pide observaciones con sugerencias y avisa el plazo del medio", async () => {
    acciones.validarEvidencia.mockResolvedValue(
      exito({
        asignacionId: EVIDENCIAS[0].asignacionId,
        estadoAsignacion: "CONTENIDO_ENTREGADO",
        fechaLimitePublicacion: "2026-10-24T15:00:00Z",
      })
    )
    const { usuario, hoja } = await abrirPrimera()
    await usuario.click(within(hoja).getByRole("button", { name: "Rechazar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Rechazar la evidencia?",
    })
    expect(dialogo).toHaveTextContent("al menos 24 horas")
    // El estado con el nombre que muestran las insignias (U6).
    expect(dialogo).toHaveTextContent("vuelve a «Contenido descargado»")
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: /Falta la etiqueta de publicidad/,
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar evidencia" })
    )
    expect(acciones.validarEvidencia).toHaveBeenCalledWith({
      aprobar: false,
      publicacionId: EVIDENCIAS[0].publicacionId,
      observaciones: expect.stringMatching(/^Falta la etiqueta de publicidad/),
      enviadaAt: EVIDENCIAS[0].enviadaAt,
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Evidencia rechazada",
      expect.objectContaining({
        description: expect.stringMatching(/^Medio 1 puede cargar otra hasta/),
      })
    )
    expect(
      await screen.findByRole("dialog", { name: "Evidencia de Medio 2" })
    ).toBeInTheDocument()
  })

  it("si el medio la cambió mientras se revisaba, no decide a ciegas y ofrece la versión nueva", async () => {
    acciones.validarEvidencia.mockResolvedValueOnce(
      fallo(MENSAJES_VALIDACION.evidenciaCambiada)
    )
    const usuario = userEvent.setup()
    const { rerender } = render(
      <RevisorEvidencias evidencias={EVIDENCIAS} plazoRecargaHoras={24} />
    )
    await usuario.click(
      screen.getByRole("button", {
        name: "Revisar la evidencia de Medio 1: Reel de Halloween",
      })
    )
    const hoja = await screen.findByRole("dialog", {
      name: "Evidencia de Medio 1",
    })
    await usuario.click(
      within(hoja).getByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
    )
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))

    expect(await within(hoja).findByRole("alert")).toHaveTextContent(
      MENSAJES_VALIDACION.evidenciaCambiada
    )
    for (const nombre of ["Aprobar", "Rechazar"]) {
      expect(
        within(hoja).queryByRole("button", { name: nombre })
      ).not.toBeInTheDocument()
    }
    // La lista aún no trae la versión nueva: se vuelve a la cola.
    const accion = within(hoja).getByRole("button", {
      name: "Volver a la cola",
    })
    await waitFor(() => expect(accion).toHaveFocus())

    // La acción revalidó la cola: llega la versión nueva y el mismo botón la ofrece.
    const nueva = evidencia(1, {
      enviadaAt: "2026-10-22T17:30:00.654321+00:00",
      urlPost: "https://www.instagram.com/reel/otro/",
    })
    rerender(
      <RevisorEvidencias
        evidencias={[nueva, EVIDENCIAS[1]]}
        plazoRecargaHoras={24}
      />
    )
    const revisar = within(hoja).getByRole("button", {
      name: "Revisar la versión nueva",
    })
    expect(revisar).toHaveFocus()
    await usuario.click(revisar)

    const actualizada = await screen.findByRole("dialog", {
      name: "Evidencia de Medio 1",
    })
    await waitFor(() =>
      expect(
        within(actualizada).getByRole("heading", {
          name: "Evidencia de Medio 1",
        })
      ).toHaveFocus()
    )
    expect(
      within(actualizada).getByRole("link", { name: /Abrir la publicación/ })
    ).toHaveAttribute("href", nueva.urlPost)
    // Se revisa desde cero: la casilla vuelve a estar sin marcar.
    const casilla = within(actualizada).getByRole("checkbox", {
      name: "La etiqueta de publicidad es visible",
    })
    expect(casilla).not.toBeChecked()
    await usuario.click(casilla)
    await usuario.click(
      within(actualizada).getByRole("button", { name: "Aprobar" })
    )
    expect(acciones.validarEvidencia).toHaveBeenLastCalledWith(
      expect.objectContaining({ enviadaAt: nueva.enviadaAt })
    )
  })
})
