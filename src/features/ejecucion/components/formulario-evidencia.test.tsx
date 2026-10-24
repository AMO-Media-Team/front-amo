import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { exito, fallo } from "@/lib/result"

import type { AsignacionEjecucion, PublicacionEjecucion } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  registrarEvidencia: vi.fn(),
  prepararCapturaEjecucion: vi.fn(),
  confirmarCapturaEjecucion: vi.fn(),
  firmarCapturaPublicacion: vi.fn(),
  firmarCapturaMetrica: vi.fn(),
}))
vi.mock("../actions", () => acciones)

const navegacion = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

/** La captura: la prueba decide si hay una elegida y cómo termina su subida. */
const carga = vi.hoisted(() => ({
  subida: { activa: false, cancelar: () => {} },
  elegida: null as File | null,
  vistaPrevia: null,
  lista: null,
  elemento: null,
  elegir: () => {},
  descartar: () => {},
  reintentar: () => {},
  obtener: vi.fn(),
}))
vi.mock("@/components/archivos/use-carga-captura", () => ({
  useCargaCaptura: () => carga,
}))

import { FormularioEvidencia } from "./formulario-evidencia"

const ID = "01a16692-e9e2-7fb6-9d68-1041425b1b76"
// 3:00 p. m. del 23 de octubre en Bogotá.
const AHORA = new Date("2026-10-23T20:00:00.000Z")

const ASIGNACION: AsignacionEjecucion = {
  id: ID,
  estado: "CONTENIDO_ENTREGADO",
  estadoPrevioDisputa: null,
  plataforma: "INSTAGRAM",
  formatoClave: "REEL",
  formatoNombre: "Reel",
  ofertaTitulo: "Lanzamiento de temporada",
  marca: "Café del Huila",
  handle: "noticias.pasto",
  publicaciones: 1,
  ventanaInicio: "2026-10-20T05:00:00.000Z",
  ventanaFin: "2026-10-30T04:59:00.000Z",
  contenidoDescargadoAt: "2026-10-20T14:00:00.000Z",
  fechaLimitePublicacion: "2026-10-30T04:59:00.000Z",
  cortesRequeridos: ["H24", "H72"],
  permanenciaMinimaDias: 7,
  reclamoHasta: null,
}

const PUBLICACION: PublicacionEjecucion = {
  id: "01a16692-e9e2-7d5b-9d80-41819e555927",
  numero: 1,
  urlPost: "https://www.instagram.com/reel/C9AbCdEfGhI",
  fechaPublicacion: "2026-10-22T00:30:00.000Z",
  estado: "RECHAZADA",
  observaciones: "La captura no muestra la fecha.",
  conMiniatura: true,
  actualizadaAt: "2026-10-22T01:00:00.000Z",
}

const CAPTURA: ArchivoSubido = {
  nombre: "panel.png",
  tipo: "image/webp",
  tamano: 2048,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: true,
  bucket: "evidencias",
  ruta: `asignacion/${ID}/publicacion/x.webp`,
  rutaMiniatura: `asignacion/${ID}/publicacion/x-min.webp`,
}

function renderizar(
  props: Partial<Parameters<typeof FormularioEvidencia>[0]> = {}
) {
  return render(
    <FormularioEvidencia
      asignacion={ASIGNACION}
      numero={1}
      publicacion={null}
      modo="cargar"
      contenido={{ vigente: null, versionDescargada: 1 }}
      pendientes={[1]}
      ahoraServidor={AHORA.getTime()}
      {...props}
    />
  )
}

const usuario = () => userEvent.setup()

const desplazar = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  // jsdom no implementa el desplazamiento.
  desplazar.mockReset()
  Element.prototype.scrollIntoView = desplazar
  for (const accion of Object.values(acciones)) accion.mockReset()
  acciones.firmarCapturaPublicacion.mockResolvedValue(fallo("sin red"))
  navegacion.push.mockReset()
  avisos.success.mockReset()
  carga.elegida = null
  carga.obtener.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

async function escribirEnlace(texto: string) {
  const campo = screen.getByLabelText("Enlace de la publicación")
  await usuario().clear(campo)
  await usuario().type(campo, texto)
}

describe("FormularioEvidencia (MED-013)", () => {
  it("abre con la fecha de hoy y el ejemplo del formato de la oferta", () => {
    renderizar()
    expect(screen.getByLabelText("Hora")).toHaveValue("15:00")
    expect(
      screen.getByText("https://www.instagram.com/reel/C9AbCdEfGhI/", {
        selector: "span",
      })
    ).toBeInTheDocument()
  })

  it("sin la etiqueta de publicidad ni la captura no envía y lo explica", async () => {
    renderizar()
    await escribirEnlace("https://www.instagram.com/reel/C9AbCdEfGhI/")
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    expect(
      await screen.findByText(
        "Confirma que tu publicación lleva la etiqueta de publicidad."
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Carga la captura del panel de estadísticas, con la fecha visible."
      )
    ).toBeInTheDocument()
    expect(acciones.registrarEvidencia).not.toHaveBeenCalled()
  })

  it("rechaza en pantalla un enlace que no es de una publicación de la red (INT-002)", async () => {
    renderizar({
      asignacion: {
        ...ASIGNACION,
        plataforma: "TIKTOK",
        formatoClave: "VIDEO",
      },
    })
    await escribirEnlace("https://www.facebook.com/reel/1234567890123456")
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    expect(
      await screen.findByText(
        "Ese enlace es de Facebook, pero la publicación debe estar en TikTok."
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Enlace de la publicación")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
  })

  it("rechaza en pantalla el video de otra cuenta (S2)", async () => {
    renderizar({
      asignacion: {
        ...ASIGNACION,
        plataforma: "TIKTOK",
        formatoClave: "VIDEO",
        handle: "noticias.cucuta",
      },
    })
    await escribirEnlace(
      "https://www.tiktok.com/@medio_b/video/7412345678901234567"
    )
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    expect(
      await screen.findByText(
        "El enlace es de @medio_b y esta campaña es con @noticias.cucuta. Pega el enlace de la publicación en tu cuenta."
      )
    ).toBeInTheDocument()
    expect(acciones.registrarEvidencia).not.toHaveBeenCalled()
  })

  it("la fecha empieza en la descarga del contenido (N2)", () => {
    renderizar({
      asignacion: {
        ...ASIGNACION,
        contenidoDescargadoAt: "2026-10-22T19:40:30.000Z",
      },
    })
    expect(
      screen.getByText(
        /^Hora de Colombia\. Desde que descargaste el contenido \(22 de oct de 2026, 2:40 p\. m\.\)/
      )
    ).toBeInTheDocument()
  })

  it("avisa sin bloquear si el enlace parece de otro tipo de contenido", async () => {
    renderizar()
    await escribirEnlace(
      "https://www.instagram.com/stories/noticias.pasto/3456789012345678901"
    )
    expect(
      await screen.findByText(
        /parece de una historia, pero esta oferta pide un reel/
      )
    ).toBeInTheDocument()
  })

  it("envía la captura lista con los datos y vuelve a la campaña", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    acciones.registrarEvidencia.mockResolvedValue(
      exito({ publicacionId: PUBLICACION.id, estadoAsignacion: "PUBLICADA" })
    )
    renderizar()
    await escribirEnlace("https://www.instagram.com/reel/C9AbCdEfGhI/?igsh=x")
    await usuario().click(
      screen.getByRole("checkbox", {
        name: "Mi publicación lleva la etiqueta de publicidad",
      })
    )
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    await waitFor(() =>
      expect(acciones.registrarEvidencia).toHaveBeenCalledWith({
        asignacionId: ID,
        numero: 1,
        url: "https://www.instagram.com/reel/C9AbCdEfGhI/?igsh=x",
        dia: "2026-10-23",
        hora: "15:00",
        etiquetaConfirmada: true,
        captura: CAPTURA,
      })
    )
    expect(navegacion.push).toHaveBeenCalledWith(`/mis-campanas/${ID}`)
    expect(avisos.success).toHaveBeenCalledWith(
      expect.stringMatching(/Enviaste tu evidencia/)
    )
  })

  it("con varias publicaciones, lleva a la siguiente que falta", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    acciones.registrarEvidencia.mockResolvedValue(
      exito({ publicacionId: "p", estadoAsignacion: "CONTENIDO_ENTREGADO" })
    )
    renderizar({
      asignacion: { ...ASIGNACION, publicaciones: 2 },
      pendientes: [1, 2],
    })
    await escribirEnlace("https://www.instagram.com/reel/C9AbCdEfGhI/")
    await usuario().click(screen.getByRole("checkbox"))
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    await waitFor(() =>
      expect(navegacion.push).toHaveBeenCalledWith(
        `/mis-campanas/${ID}/evidencia?numero=2`
      )
    )
  })

  it("si la captura no sube, lo dice junto a la captura y no envía", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: false, error: "Sin conexión." })
    renderizar()
    await escribirEnlace("https://www.instagram.com/reel/C9AbCdEfGhI/")
    await usuario().click(screen.getByRole("checkbox"))
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    expect(await screen.findByText("Sin conexión.")).toHaveAttribute(
      "role",
      "alert"
    )
    expect(acciones.registrarEvidencia).not.toHaveBeenCalled()
  })

  it("al corregir muestra las observaciones y conserva la captura anterior", async () => {
    acciones.registrarEvidencia.mockResolvedValue(
      exito({ publicacionId: PUBLICACION.id, estadoAsignacion: "PUBLICADA" })
    )
    renderizar({
      publicacion: PUBLICACION,
      modo: "corregir",
      observaciones: PUBLICACION.observaciones,
    })
    expect(
      screen.getByText("El equipo AMO pidió corregir tu evidencia")
    ).toBeInTheDocument()
    expect(
      screen.getByText("La captura no muestra la fecha.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Enlace de la publicación")).toHaveValue(
      PUBLICACION.urlPost
    )
    await usuario().click(screen.getByRole("checkbox"))
    await usuario().click(
      screen.getByRole("button", { name: "Enviar la corrección" })
    )
    await waitFor(() =>
      expect(acciones.registrarEvidencia).toHaveBeenCalledWith(
        expect.objectContaining({
          url: PUBLICACION.urlPost,
          dia: "2026-10-21",
          hora: "19:30",
          captura: null,
        })
      )
    )
  })

  it("un error de la BD se muestra en su campo, que recibe el foco y queda a la vista al terminar el envío (U1)", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    const mensaje =
      "Ese enlace ya se registró como evidencia de otra publicación. Revisa que sea el de tu publicación."
    acciones.registrarEvidencia.mockResolvedValue(
      fallo(mensaje, { url: [mensaje] })
    )
    renderizar()
    await escribirEnlace("https://www.instagram.com/reel/C9AbCdEfGhI/")
    await usuario().click(screen.getByRole("checkbox"))
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    const enlace = screen.getByLabelText("Enlace de la publicación")
    await waitFor(() => expect(enlace).toHaveFocus())
    expect(enlace).toBeEnabled()
    expect(desplazar).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" })
    )
    expect(desplazar.mock.contexts.at(-1)).toBe(enlace)
    expect(navegacion.push).not.toHaveBeenCalled()
  })

  it("un error de la captura que devuelve el servidor lleva el foco a la captura", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    const mensaje =
      "La captura no corresponde a esta campaña. Elígela de nuevo para subirla."
    acciones.registrarEvidencia.mockResolvedValue(
      fallo(mensaje, { captura: [mensaje] })
    )
    renderizar()
    await escribirEnlace("https://www.instagram.com/reel/C9AbCdEfGhI/")
    await usuario().click(screen.getByRole("checkbox"))
    await usuario().click(
      screen.getByRole("button", { name: "Enviar evidencia" })
    )
    const error = await screen.findByText(mensaje)
    const zona = error.parentElement as HTMLElement
    await waitFor(() => expect(zona).toHaveFocus())
    expect(zona).toHaveAttribute("data-foco-error")
  })

  it("avisa si hay una versión nueva del contenido sin descargar", () => {
    renderizar({
      contenido: {
        vigente: { version: 2, activadoAt: "2026-10-21T15:00:00.000Z" },
        versionDescargada: 1,
      },
    })
    expect(
      screen.getByText("Hay una versión nueva del contenido")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver el contenido" })
    ).toHaveAttribute("href", `/mis-campanas/${ID}/contenido`)
  })
})
