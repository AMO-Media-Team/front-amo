import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { SituacionContenido } from "../contenido"
import { ASIGNACION_ID, versionDePrueba } from "../fixtures"
import { interpretarAccion } from "../siguiente-accion"
import type { AccionMedio, DescargaContenido } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  descargarContenido: vi.fn(),
  firmarArchivoContenido: vi.fn(),
  desistirAsignacion: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { PanelContenido } from "./panel-contenido"

const AHORA = new Date("2026-10-26T12:00:00.000Z").getTime()
const V1 = versionDePrueba({ id: "v1", version: 1 })
const V2 = versionDePrueba({ id: "v2", version: 2 })
const DESCARGAS: DescargaContenido[] = [
  { at: "2026-10-25T15:00:00.000Z", creativoId: "v1", version: 1 },
]
const PUBLICAR = interpretarAccion({
  asignacionId: ASIGNACION_ID,
  ofertaTitulo: "Reel de Halloween",
  accion: "PUBLICAR",
  venceAt: "2026-10-30T05:00:00.000Z",
  numero: null,
  corte: null,
}) as AccionMedio

function pintar(
  situacion: SituacionContenido,
  props: Partial<Parameters<typeof PanelContenido>[0]> = {}
) {
  const usuario = userEvent.setup()
  const resultado = render(
    <PanelContenido
      asignacionId={ASIGNACION_ID}
      situacion={situacion}
      descargas={[]}
      puedeEjecutar
      siguiente={null}
      fechaLimitePublicacion="2026-10-30T05:00:00.000Z"
      ahoraServidor={AHORA}
      {...props}
    />
  )
  return { usuario, ...resultado }
}

describe("PanelContenido", () => {
  beforeEach(() => {
    acciones.descargarContenido.mockReset()
    acciones.firmarArchivoContenido.mockResolvedValue(
      exito({ url: "https://storage.test/video.mp4", vigenciaSegundos: 300 })
    )
    avisos.success.mockReset()
  })

  it("antes de descargar: qué trae y el botón en el pie", async () => {
    acciones.descargarContenido.mockResolvedValueOnce(
      fallo(
        "Venció el plazo para publicar: ya no puedes descargar el contenido."
      )
    )
    const { usuario } = pintar({ tipo: "por_descargar", vigente: V1 })
    expect(
      screen.getByRole("heading", { name: "Tu contenido está listo" })
    ).toBeVisible()
    expect(screen.getByText(/Versión 1: 1 video/)).toBeVisible()
    // Los archivos no se firman antes de registrar la descarga.
    expect(acciones.firmarArchivoContenido).not.toHaveBeenCalled()

    const pie = screen.getByRole("region", { name: "Descargar el contenido" })
    const boton = within(pie).getByRole("button", {
      name: "Descargar el contenido",
    })
    await usuario.click(boton)
    expect(acciones.descargarContenido).toHaveBeenCalledWith({
      asignacionId: ASIGNACION_ID,
    })
    const error = await screen.findByRole("alert")
    expect(error).toHaveTextContent(/Venció el plazo para publicar/)
    expect(boton).toHaveAccessibleDescription(/Venció el plazo para publicar/)
  })

  it("al descargar avisa con la versión y el contenido recibe el foco", async () => {
    acciones.descargarContenido.mockResolvedValueOnce(exito({ version: 1 }))
    const { usuario, rerender } = pintar({ tipo: "por_descargar", vigente: V1 })
    await usuario.click(
      screen.getByRole("button", { name: "Descargar el contenido" })
    )
    await waitFor(() =>
      expect(avisos.success).toHaveBeenCalledWith(
        "Descargaste la versión 1",
        expect.anything()
      )
    )
    // `refresh()`: la página vuelve con la versión descargada.
    rerender(
      <PanelContenido
        asignacionId={ASIGNACION_ID}
        situacion={{ tipo: "al_dia", version: V1 }}
        descargas={DESCARGAS}
        puedeEjecutar
        siguiente={PUBLICAR}
        fechaLimitePublicacion="2026-10-30T05:00:00.000Z"
        ahoraServidor={AHORA}
      />
    )
    const titulo = screen.getByRole("heading", {
      name: "Tu contenido · versión 1",
    })
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(
      within(screen.getByRole("region", { name: "Lo que sigue" })).getByRole(
        "link",
        { name: "Cargar la evidencia" }
      )
    ).toHaveAttribute("href", `/mis-campanas/${ASIGNACION_ID}/evidencia`)
  })

  it("descargado: archivos firmados por id y el texto copiable", async () => {
    pintar({ tipo: "al_dia", version: V1 }, { descargas: DESCARGAS })
    expect(screen.getByText(/Descargaste esta versión el/)).toBeVisible()
    await waitFor(() =>
      expect(acciones.firmarArchivoContenido).toHaveBeenCalledWith({
        asignacionId: ASIGNACION_ID,
        archivoId: V1.archivos[0].id,
      })
    )
    for (const nombre of [
      "Copiar todo",
      "Copiar el texto",
      "Copiar los hashtags",
      "Copiar las menciones",
      "Copiar el enlace",
    ]) {
      expect(screen.getByRole("button", { name: nombre })).toBeVisible()
    }
    expect(screen.getByText("#CostaAzul")).toBeVisible()
  })

  it("una versión nueva se destaca para descargarla antes de publicar", () => {
    pintar(
      { tipo: "version_nueva", descargada: V1, vigente: V2 },
      { descargas: DESCARGAS }
    )
    expect(
      screen.getByText("Hay una versión nueva del contenido")
    ).toBeVisible()
    expect(
      screen.getByText(/el anunciante la actualizó a la versión 2/)
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Descargar la versión 2" })
    ).toBeVisible()
  })

  it("sin permiso para ejecutar no ofrece descargar", () => {
    pintar({ tipo: "por_descargar", vigente: V1 }, { puedeEjecutar: false })
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText(/no descargar su contenido/)).toBeVisible()
  })

  it("explica por qué no hay contenido", () => {
    const { rerender } = pintar({ tipo: "no_disponible" })
    expect(screen.getByText("El contenido ya no está disponible")).toBeVisible()
    rerender(
      <PanelContenido
        asignacionId={ASIGNACION_ID}
        situacion={{ tipo: "fuera_de_plazo" }}
        descargas={[]}
        puedeEjecutar
        siguiente={null}
        fechaLimitePublicacion="2026-10-25T05:00:00.000Z"
        ahoraServidor={AHORA}
      />
    )
    expect(screen.getByText("Venció el plazo para descargar")).toBeVisible()
  })
})
