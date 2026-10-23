import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  consultarSeguimiento: vi.fn(),
  firmarCaptura: vi.fn(),
  consultarPerfilMedio: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { asignacionPrueba, cortePrueba, publicacionPrueba } from "../fixtures"
import type { AsignacionSeguimiento } from "../tipos"
import { TarjetaAsignacion } from "./tarjeta-asignacion"

const AHORA = Date.parse("2026-10-16T15:00:00.000Z")
const URL_FIRMADA = "https://amo.test/storage/v1/object/sign/evidencias/x.webp"

function Envoltura({
  asignacion,
  abiertaAlInicio = false,
}: {
  asignacion: AsignacionSeguimiento
  abiertaAlInicio?: boolean
}) {
  const [abierta, setAbierta] = useState(abiertaAlInicio)
  return (
    <TarjetaAsignacion
      asignacion={asignacion}
      abierta={abierta}
      onAbiertaChange={setAbierta}
      destacada={false}
      novedad={null}
      ahoraServidor={AHORA}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  acciones.firmarCaptura.mockResolvedValue(
    exito({ url: URL_FIRMADA, vigenciaSegundos: 300 })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe("TarjetaAsignacion", () => {
  it("muestra el medio, su alcance declarado, el valor del cupo y el enlace al post", () => {
    const publicacion = publicacionPrueba({ estadoValidacion: "PENDIENTE" })
    render(
      <Envoltura
        asignacion={asignacionPrueba({
          estado: "PUBLICADA",
          publicadaAt: "2026-10-14T13:23:00.000Z",
          publicaciones: [publicacion],
        })}
      />
    )
    const tarjeta = screen.getByRole("article", { name: /Comunidad Sincelejo/ })
    expect(within(tarjeta).getByText("Sincelejo, Sucre")).toBeInTheDocument()
    expect(within(tarjeta).getByText("Publicada")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText("113.398 seguidores al aceptar · Franja F2")
    ).toBeInTheDocument()
    expect(
      within(tarjeta).getByRole("link", { name: /@comunidadsincelejo/ })
    ).toHaveAttribute("href", "https://www.instagram.com/comunidadsincelejo/")
    expect(within(tarjeta).getByText(/205\.900/)).toBeInTheDocument()
    const post = within(tarjeta).getByRole("link", {
      name: /Ver publicación/,
    })
    expect(post).toHaveAttribute("href", publicacion.urlPost)
    expect(post).toHaveAttribute("target", "_blank")
    expect(post.getAttribute("rel")).toContain("noopener")
    expect(within(tarjeta).getByText("En revisión")).toBeInTheDocument()
    // Nunca lo que recibe el medio ni datos privados.
    expect(tarjeta.textContent).not.toMatch(/recibe|bancari|documento/i)
  })

  it("mientras no publica, muestra el plazo con su cuenta regresiva", () => {
    // El reloj del componente lee la hora del dispositivo al hidratar.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
    render(
      <Envoltura
        asignacion={asignacionPrueba({
          estado: "CONTENIDO_ENTREGADO",
          fechaLimitePublicacion: "2026-10-18T15:00:00.000Z",
        })}
      />
    )
    expect(screen.getByText("Por publicar")).toBeInTheDocument()
    expect(screen.getByText(/Vence en 2 días/)).toBeInTheDocument()
  })

  it("al desplegarla firma la captura, muestra los cortes aprobados y la línea de tiempo", async () => {
    const usuario = userEvent.setup()
    const publicacion = publicacionPrueba({
      cortes: [
        cortePrueba({ corte: "H24", alcance: 6017, impresiones: 7607 }),
        cortePrueba({
          corte: "H72",
          fechaCorte: "2026-10-17T13:00:00.000Z",
          alcance: 8750,
          impresiones: 11062,
          interacciones: 276,
        }),
      ],
    })
    render(
      <Envoltura
        asignacion={asignacionPrueba({
          estado: "METRICAS_CARGADAS",
          publicadaAt: "2026-10-14T13:23:00.000Z",
          publicaciones: [publicacion],
        })}
      />
    )
    // Resumen al último corte aprobado (72 horas).
    expect(screen.getByText("8.750")).toBeInTheDocument()

    const desplegar = screen.getByRole("button", {
      name: "Evidencia, métricas y línea de tiempo",
    })
    expect(desplegar).toHaveAttribute("aria-expanded", "false")
    await usuario.click(desplegar)
    expect(desplegar).toHaveAttribute("aria-expanded", "true")

    const captura = await screen.findByRole("img", {
      name: "Captura de la publicación de @comunidadsincelejo",
    })
    expect(captura).toHaveAttribute("src", URL_FIRMADA)
    expect(acciones.firmarCaptura).toHaveBeenCalledWith({
      publicacionId: publicacion.id,
      variante: "miniatura",
    })

    const tabla = screen.getByRole("table", {
      name: /Métricas aprobadas: Publicación de @comunidadsincelejo/,
    })
    const filas = within(tabla).getAllByRole("row")
    expect(filas).toHaveLength(3)
    expect(within(filas[2]).getByText("72 horas")).toBeInTheDocument()
    expect(within(filas[2]).getByText("11.062")).toBeInTheDocument()

    expect(
      screen.getByRole("list", { name: /Línea de tiempo de Comunidad/ })
    ).toBeInTheDocument()
    expect(screen.getByText("Aceptó el cupo")).toBeInTheDocument()
  })

  it("en TikTok nombra el alcance y las impresiones como la plataforma", async () => {
    render(
      <Envoltura
        asignacion={asignacionPrueba({
          plataforma: "TIKTOK",
          estado: "EVIDENCIA_VALIDADA",
          cuenta: {
            plataforma: "TIKTOK",
            handle: "pasto.al.dia",
            url: "https://www.tiktok.com/@pasto.al.dia",
            seguidoresAlAceptar: 52000,
            franja: "F1",
          },
          publicaciones: [
            publicacionPrueba({
              urlPost: "https://www.tiktok.com/@pasto.al.dia/video/1",
              cortes: [cortePrueba({ reproducciones: 9000 })],
            }),
          ],
        })}
        abiertaAlInicio
      />
    )
    const tabla = await screen.findByRole("table")
    expect(
      within(tabla).getByRole("columnheader", { name: "Espectadores únicos" })
    ).toBeInTheDocument()
    expect(
      within(tabla).getByRole("columnheader", { name: "Reproducciones" })
    ).toBeInTheDocument()
  })

  it("si la captura no se puede firmar lo explica y deja reintentar", async () => {
    const usuario = userEvent.setup()
    acciones.firmarCaptura.mockResolvedValueOnce(
      fallo("Esta captura no está disponible para tu cuenta.")
    )
    render(
      <Envoltura
        asignacion={asignacionPrueba({
          estado: "PUBLICADA",
          publicaciones: [publicacionPrueba()],
        })}
        abiertaAlInicio
      />
    )
    expect(
      await screen.findByText("Esta captura no está disponible para tu cuenta.")
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(await screen.findByRole("img")).toHaveAttribute("src", URL_FIRMADA)
  })

  it("una evidencia rechazada se presenta como en corrección", async () => {
    render(
      <Envoltura
        asignacion={asignacionPrueba({
          estado: "CONTENIDO_ENTREGADO",
          publicaciones: [
            publicacionPrueba({
              estadoValidacion: "RECHAZADA",
              conCaptura: false,
            }),
          ],
        })}
        abiertaAlInicio
      />
    )
    expect(screen.getAllByText("En corrección").length).toBeGreaterThan(0)
    expect(
      screen.getByText(/El equipo AMO pidió corregir esta evidencia/)
    ).toBeInTheDocument()
    expect(screen.getByText("Sin captura")).toBeInTheDocument()
    await waitFor(() => expect(acciones.firmarCaptura).not.toHaveBeenCalled())
  })
})
