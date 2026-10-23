import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ASIGNACION_ID,
  asignacionDePrueba,
  metricaDePrueba,
  publicacionDePrueba,
} from "../fixtures"
import type { AsignacionMedio, EjecucionAsignacion } from "../tipos"
import { PublicacionesAsignacion } from "./publicaciones-asignacion"

// La publicación es del 26 a las 15:00 UTC: el corte de 24 h ya se cumplió,
// el de 72 h aún no.
const AHORA = new Date("2026-10-28T00:00:00.000Z")

function pintar(
  asignacion: AsignacionMedio,
  ejecucion: Pick<EjecucionAsignacion, "publicaciones" | "metricas">,
  puedeEjecutar = true
) {
  return render(
    <PublicacionesAsignacion
      asignacion={asignacion}
      ejecucion={ejecucion}
      plazoCargaHoras={48}
      ahoraServidor={AHORA.getTime()}
      puedeEjecutar={puedeEjecutar}
    />
  )
}

function fila(nombre: string) {
  const corte = screen.getByText(nombre, { selector: "span" })
  const elemento = corte.closest("li")
  if (!elemento) throw new Error(nombre)
  return elemento
}

describe("PublicacionesAsignacion", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("cada corte con su situación y el botón directo a su formulario", () => {
    pintar(asignacionDePrueba({ estado: "PUBLICADA" }), {
      publicaciones: [publicacionDePrueba()],
      metricas: [],
    })
    expect(screen.getByText("Evidencia cargada")).toBeVisible()
    expect(
      screen.getByRole("link", { name: /Ver la publicación/ })
    ).toHaveAttribute("href", "https://www.instagram.com/reel/C0ABCdef123/")
    expect(screen.getByText(/Mantenla publicada hasta el/)).toBeVisible()

    const h24 = fila("24 horas")
    expect(
      within(h24).getByRole("link", {
        name: "Cargar las métricas de 24 horas",
      })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/metricas?numero=1&corte=H24`
    )
    expect(within(h24).getByText(/^Vence en/)).toBeInTheDocument()

    const h72 = fila("72 horas")
    expect(within(h72).getByText(/^Se habilita en/)).toBeInTheDocument()
    expect(within(h72).queryByRole("link")).not.toBeInTheDocument()

    expect(
      screen.getByRole("link", { name: "Agregar un corte personalizado" })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/metricas?numero=1&corte=PERSONALIZADO`
    )
  })

  it("una métrica rechazada muestra las observaciones y se corrige", () => {
    pintar(asignacionDePrueba({ estado: "EVIDENCIA_VALIDADA" }), {
      publicaciones: [publicacionDePrueba({ estado: "APROBADA" })],
      metricas: [
        metricaDePrueba({
          estado: "RECHAZADA",
          observaciones: "La captura no muestra el alcance.",
        }),
      ],
    })
    const h24 = fila("24 horas")
    expect(within(h24).getByText("Por corregir")).toBeVisible()
    expect(
      within(h24).getByText("La captura no muestra el alcance.")
    ).toBeVisible()
    expect(
      within(h24).getByRole("link", {
        name: "Corregir las métricas de 24 horas",
      })
    ).toBeVisible()
  })

  it("cada corte personalizado se corrige o edita por su id; el aprobado no", () => {
    const personalizado = (
      id: string,
      estado: "RECHAZADA" | "PENDIENTE" | "APROBADA",
      desde: string
    ) =>
      metricaDePrueba({
        id,
        corte: "PERSONALIZADO",
        estado,
        periodoDesde: desde,
        periodoHasta: desde,
        observaciones:
          estado === "RECHAZADA" ? "La captura es de otro periodo." : null,
      })
    const rechazada = "0199f3a0-0000-7000-8000-0000000000c2"
    const pendiente = "0199f3a0-0000-7000-8000-0000000000c3"
    pintar(
      asignacionDePrueba({ estado: "EVIDENCIA_VALIDADA", publicaciones: 2 }),
      {
        publicaciones: [publicacionDePrueba({ estado: "APROBADA" })],
        metricas: [
          personalizado(rechazada, "RECHAZADA", "2026-10-27"),
          personalizado(pendiente, "PENDIENTE", "2026-10-28"),
          personalizado(
            "0199f3a0-0000-7000-8000-0000000000c4",
            "APROBADA",
            "2026-10-29"
          ),
        ],
      }
    )
    const corregir = screen.getByRole("link", {
      name: /^Corregir el corte personalizado del .+ de la publicación 1$/,
    })
    expect(corregir).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/metricas?numero=1&corte=PERSONALIZADO&metrica=${rechazada}`
    )
    expect(screen.getByText("La captura es de otro periodo.")).toBeVisible()
    expect(
      screen.getByRole("link", {
        name: /^Editar el corte personalizado del .+ de la publicación 1$/,
      })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/metricas?numero=1&corte=PERSONALIZADO&metrica=${pendiente}`
    )
    // El aprobado ya no se toca: dos enlaces, no tres.
    expect(
      screen.getAllByRole("link", { name: /el corte personalizado/ })
    ).toHaveLength(2)
  })

  it("una evidencia rechazada se corrige primero; con varias publicaciones las nombra", () => {
    pintar(
      asignacionDePrueba({ estado: "CONTENIDO_ENTREGADO", publicaciones: 2 }),
      {
        publicaciones: [
          publicacionDePrueba({
            estado: "RECHAZADA",
            observaciones: "Falta la etiqueta de publicidad.",
          }),
        ],
        metricas: [],
      }
    )
    expect(screen.getByText("1 de 2 publicaciones con evidencia")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Publicación 1" })).toBeVisible()
    expect(screen.getByText("Falta la etiqueta de publicidad.")).toBeVisible()
    expect(
      screen.getByRole("link", {
        name: "Corregir la evidencia de la publicación 1",
      })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/evidencia?numero=1`
    )
    expect(
      screen.getByRole("link", {
        name: "Cargar la evidencia de la publicación 2",
      })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/evidencia?numero=2`
    )
    expect(
      screen.getAllByText("Primero corrige la evidencia").length
    ).toBeGreaterThan(0)
  })

  it("sin permiso para ejecutar no ofrece botones", () => {
    pintar(
      asignacionDePrueba({ estado: "PUBLICADA" }),
      { publicaciones: [publicacionDePrueba()], metricas: [] },
      false
    )
    expect(
      screen.queryByRole("link", { name: /Cargar|Agregar|Corregir|Editar/ })
    ).not.toBeInTheDocument()
  })

  it("en disputa sigue cargando sus cortes con el estado que tenía (D72)", () => {
    pintar(
      asignacionDePrueba({
        estado: "EN_DISPUTA",
        estadoPrevioDisputa: "EVIDENCIA_VALIDADA",
      }),
      {
        publicaciones: [publicacionDePrueba({ estado: "APROBADA" })],
        metricas: [],
      }
    )
    expect(
      within(fila("24 horas")).getByRole("link", {
        name: "Cargar las métricas de 24 horas",
      })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/metricas?numero=1&corte=H24`
    )
  })
})
