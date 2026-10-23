import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { EstadoCampana } from "@/features/operacion/estados"
import { exito, fallo, type ResultadoAccion } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  consultarSeguimiento: vi.fn(),
  firmarCaptura: vi.fn(),
  consultarPerfilMedio: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import {
  asignacionPrueba,
  CAMPANA_PRUEBA,
  idPrueba,
  publicacionPrueba,
  seguimientoPrueba,
} from "../fixtures"
import type { AsignacionSeguimiento, SeguimientoCampana } from "../tipos"
import { PanelSeguimiento, TARJETAS_POR_TRAMO } from "./panel-seguimiento"

// Consulta reciente: el sondeo automático no salta durante la prueba.
const RECIENTE = new Date().toISOString()

function medio(nombre: string) {
  return { ...asignacionPrueba().medio, nombre }
}

const porPublicar = asignacionPrueba({
  medio: medio("Radio Pasto"),
  estado: "CONTENIDO_ENTREGADO",
  aceptadaAt: "2026-10-10T15:00:00.000Z",
  contenidoDescargadoAt: "2026-10-11T15:00:00.000Z",
})
const publicada = asignacionPrueba({
  medio: medio("Noticias Tumaco"),
  estado: "PUBLICADA",
  aceptadaAt: "2026-10-09T15:00:00.000Z",
  publicadaAt: "2026-10-14T13:00:00.000Z",
  publicaciones: [publicacionPrueba({ estadoValidacion: "PENDIENTE" })],
})
const cumplida = asignacionPrueba({
  medio: medio("Ipiales Hoy"),
  estado: "PAGADA",
  aceptadaAt: "2026-10-01T15:00:00.000Z",
  verificadaAt: "2026-10-12T15:00:00.000Z",
})

function renderizar(
  inicial: SeguimientoCampana,
  {
    url = "",
    estadoCampana = "ACTIVA",
  }: { url?: string; estadoCampana?: EstadoCampana } = {}
) {
  const usuario = userEvent.setup()
  render(
    <NuqsTestingAdapter searchParams={url} hasMemory>
      <PanelSeguimiento inicial={inicial} estadoCampana={estadoCampana} />
    </NuqsTestingAdapter>
  )
  return usuario
}

function nombresVisibles(): string[] {
  return screen
    .getAllByRole("article")
    .map(
      (tarjeta) =>
        within(tarjeta).getByRole("heading", { level: 3 }).textContent ?? ""
    )
}

// jsdom no implementa el desplazamiento.
Element.prototype.scrollIntoView ??= () => {}

/**
 * El panel recuerda la última consulta de cada campaña (al volver a la
 * pestaña parte de ella): las pruebas que actualizan usan su propia campaña.
 */
function campanaPropia(
  asignaciones: AsignacionSeguimiento[]
): SeguimientoCampana {
  return seguimientoPrueba(asignaciones, RECIENTE, idPrueba())
}

/** Una respuesta que la prueba entrega cuando quiere. */
function diferida<T>() {
  let resolver: (valor: T) => void = () => {}
  const promesa = new Promise<T>((resolucion) => {
    resolver = resolucion
  })
  return { promesa, resolver }
}

beforeEach(() => {
  vi.clearAllMocks()
  acciones.firmarCaptura.mockResolvedValue(
    exito({ url: "https://amo.test/x.webp", vigenciaSegundos: 300 })
  )
})

describe("PanelSeguimiento", () => {
  it("lista lo último que pasó primero y cuenta por grupo", () => {
    renderizar(seguimientoPrueba([cumplida, porPublicar, publicada], RECIENTE))
    expect(nombresVisibles()).toEqual([
      "Noticias Tumaco",
      "Ipiales Hoy",
      "Radio Pasto",
    ])
    const filtro = screen.getByRole("group", {
      name: "Filtrar las asignaciones por estado",
    })
    expect(
      within(filtro).getByRole("button", { name: /Todas/ })
    ).toHaveAttribute("aria-pressed", "true")
    expect(
      within(filtro).getByRole("button", { name: /Cumplidas/ })
    ).toHaveTextContent("1")
    // «En disputa» solo aparece si hay alguna.
    expect(
      within(filtro).queryByRole("button", { name: /En disputa/ })
    ).toBeNull()
  })

  it("filtra por grupo y vuelve a todas", async () => {
    const usuario = renderizar(
      seguimientoPrueba([cumplida, porPublicar, publicada], RECIENTE)
    )
    await usuario.click(screen.getByRole("button", { name: /Por publicar/ }))
    expect(nombresVisibles()).toEqual(["Radio Pasto"])
    expect(
      screen.getByRole("list", { name: "Asignaciones: Por publicar" })
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: /Sin completar/ }))
    expect(
      screen.getByText("No hay asignaciones en «Sin completar»")
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: "Ver todas" }))
    expect(nombresVisibles()).toHaveLength(3)
  })

  it("sin medios todavía, lo explica y lleva a las ofertas", () => {
    renderizar(seguimientoPrueba([], RECIENTE))
    expect(
      screen.getByText("Aún ningún medio acepta tus ofertas")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver las ofertas" })
    ).toHaveAttribute("href", `/campanas/${CAMPANA_PRUEBA}?pestana=ofertas`)
  })

  it("una campaña cerrada sin medios dice que no tuvo participantes", () => {
    renderizar(seguimientoPrueba([], RECIENTE), { estadoCampana: "FINALIZADA" })
    expect(
      screen.getByText("Esta campaña no tuvo medios participantes")
    ).toBeInTheDocument()
  })

  it("?asignacion= abre, resalta y enfoca esa tarjeta", async () => {
    renderizar(
      seguimientoPrueba([cumplida, porPublicar, publicada], RECIENTE),
      {
        url: `?pestana=seguimiento&asignacion=${porPublicar.id}`,
      }
    )
    const tarjeta = document.getElementById(`asignacion-${porPublicar.id}`)
    expect(tarjeta).not.toBeNull()
    await waitFor(() => expect(tarjeta).toHaveFocus())
    expect(
      within(tarjeta as HTMLElement).getByRole("button", {
        name: "Línea de tiempo",
      })
    ).toHaveAttribute("aria-expanded", "true")
  })

  it("si la asignación del enlace no es de esta campaña, lo dice", () => {
    renderizar(seguimientoPrueba([cumplida], RECIENTE), {
      url: "?asignacion=0199f3a0-0000-7000-8000-0000000000ff",
    })
    expect(
      screen.getByText(/No encontramos esa asignación en esta campaña/)
    ).toBeInTheDocument()
  })

  it("«Actualizar» trae lo nuevo, marca las novedades y lo anuncia", async () => {
    const inicial = campanaPropia([porPublicar])
    const usuario = renderizar(inicial)
    const ahoraPublicada: AsignacionSeguimiento = {
      ...porPublicar,
      estado: "PUBLICADA",
      publicadaAt: "2026-10-16T14:00:00.000Z",
      publicaciones: [publicacionPrueba({ estadoValidacion: "PENDIENTE" })],
    }
    acciones.consultarSeguimiento.mockResolvedValue(
      exito(
        seguimientoPrueba(
          [ahoraPublicada, publicada],
          new Date().toISOString(),
          inicial.campanaId
        )
      )
    )

    await usuario.click(screen.getByRole("button", { name: "Actualizar" }))

    expect(acciones.consultarSeguimiento).toHaveBeenCalledWith({
      campanaId: inicial.campanaId,
    })
    expect(
      await screen.findByText(
        "Seguimiento actualizado: 1 medio nuevo y 1 asignación con novedades."
      )
    ).toBeInTheDocument()
    const tarjeta = screen.getByRole("article", { name: /Radio Pasto/ })
    expect(within(tarjeta).getByText("Con novedades")).toBeInTheDocument()
    expect(
      within(
        screen.getByRole("article", { name: /Noticias Tumaco/ })
      ).getByText("Nueva")
    ).toBeInTheDocument()
    // La que ya estaba no salta aunque ahora sea la más reciente: la nueva entra arriba.
    expect(nombresVisibles()).toEqual(["Noticias Tumaco", "Radio Pasto"])
  })

  it("sin cambios, la actualización pedida dice que está al día", async () => {
    const inicial = campanaPropia([porPublicar])
    const usuario = renderizar(inicial)
    acciones.consultarSeguimiento.mockResolvedValue(
      exito({ ...inicial, consultadoAt: new Date().toISOString() })
    )
    await usuario.click(screen.getByRole("button", { name: "Actualizar" }))
    expect(
      await screen.findByText("El seguimiento ya estaba al día.")
    ).toBeInTheDocument()
  })

  it("el sondeo automático no deshabilita «Actualizar» ni le quita el foco", async () => {
    // Datos de hace dos minutos: el sondeo consulta enseguida al montar.
    const haceDosMinutos = new Date(Date.now() - 2 * 60_000).toISOString()
    const inicial = seguimientoPrueba([porPublicar], haceDosMinutos, idPrueba())
    const respuesta = diferida<ResultadoAccion<SeguimientoCampana>>()
    acciones.consultarSeguimiento.mockReturnValue(respuesta.promesa)
    renderizar(inicial)
    const actualizar = screen.getByRole("button", { name: "Actualizar" })
    act(() => actualizar.focus())

    await waitFor(() =>
      expect(acciones.consultarSeguimiento).toHaveBeenCalledTimes(1)
    )
    expect(screen.getByText("Actualizando…")).toBeInTheDocument()
    expect(actualizar).not.toHaveAttribute("disabled")
    expect(actualizar).not.toHaveAttribute("aria-disabled", "true")
    expect(actualizar).not.toHaveAttribute("aria-busy")
    expect(actualizar).toHaveFocus()

    await act(async () =>
      respuesta.resolver(
        exito({ ...inicial, consultadoAt: new Date().toISOString() })
      )
    )
    expect(await screen.findByText(/Actualizado a las/)).toBeInTheDocument()
    expect(actualizar).toHaveFocus()
    // Sin cambios, la automática no anuncia nada.
    expect(screen.queryByText("El seguimiento ya estaba al día.")).toBeNull()
  })

  it("«Actualizar» muestra que carga sin soltar el foco ni repetir la consulta", async () => {
    const inicial = campanaPropia([porPublicar])
    const respuesta = diferida<ResultadoAccion<SeguimientoCampana>>()
    acciones.consultarSeguimiento.mockReturnValue(respuesta.promesa)
    const usuario = renderizar(inicial)
    const actualizar = screen.getByRole("button", { name: "Actualizar" })

    await usuario.click(actualizar)
    expect(actualizar).toHaveAttribute("aria-disabled", "true")
    expect(actualizar).toHaveAttribute("aria-busy", "true")
    expect(actualizar).not.toHaveAttribute("disabled")
    expect(actualizar).toHaveFocus()
    await usuario.click(actualizar)
    expect(acciones.consultarSeguimiento).toHaveBeenCalledTimes(1)

    await act(async () =>
      respuesta.resolver(
        exito({ ...inicial, consultadoAt: new Date().toISOString() })
      )
    )
    expect(
      await screen.findByText("El seguimiento ya estaba al día.")
    ).toBeInTheDocument()
    expect(actualizar).not.toHaveAttribute("aria-disabled", "true")
    expect(actualizar).toHaveFocus()
  })

  it("si la actualización falla, conserva lo cargado y lo explica", async () => {
    const usuario = renderizar(campanaPropia([porPublicar]))
    acciones.consultarSeguimiento.mockResolvedValue(
      fallo(
        "No pudimos actualizar el seguimiento. Lo intentaremos de nuevo en un minuto."
      )
    )
    await usuario.click(screen.getByRole("button", { name: "Actualizar" }))
    expect(
      await screen.findByText(/Mientras tanto ves lo último que cargó/)
    ).toBeInTheDocument()
    expect(nombresVisibles()).toEqual(["Radio Pasto"])
  })

  it("muestra las tarjetas por tramos y lleva el foco a la primera nueva", async () => {
    const muchas = Array.from({ length: TARJETAS_POR_TRAMO + 3 }, (_, i) =>
      asignacionPrueba({
        medio: medio(`Medio ${String(i + 1).padStart(2, "0")}`),
        aceptadaAt: new Date(Date.UTC(2026, 9, 1, 0, 60 - i)).toISOString(),
        contenidoDescargadoAt: null,
      })
    )
    const usuario = renderizar(seguimientoPrueba(muchas, RECIENTE))
    expect(screen.getAllByRole("article")).toHaveLength(TARJETAS_POR_TRAMO)
    await usuario.click(screen.getByRole("button", { name: /Ver 3 más/ }))
    expect(screen.getAllByRole("article")).toHaveLength(TARJETAS_POR_TRAMO + 3)
    expect(screen.queryByRole("button", { name: /más/ })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole("article", { name: /Medio 21/ })).toHaveFocus()
    )
  })
})
