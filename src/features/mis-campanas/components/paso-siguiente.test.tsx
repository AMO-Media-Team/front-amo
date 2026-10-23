import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ASIGNACION_ID } from "../fixtures"
import { interpretarAccion } from "../siguiente-accion"
import type { AccionMedio, PasoMedio } from "../tipos"
import { PasoSiguiente } from "./paso-siguiente"

const AHORA = new Date("2026-10-26T12:00:00.000Z")

function accion(
  codigo: string,
  venceAt: string,
  extra: { numero?: number; corte?: "H24" | "H72" | "D7" } = {}
): AccionMedio {
  const interpretada = interpretarAccion({
    asignacionId: ASIGNACION_ID,
    ofertaTitulo: "Reel de Halloween",
    accion: codigo,
    venceAt,
    numero: extra.numero ?? null,
    corte: extra.corte ?? null,
  })
  if (!interpretada) throw new Error(codigo)
  return interpretada
}

function pintar(paso: PasoMedio, opciones: { puedeEjecutar?: boolean } = {}) {
  return render(
    <PasoSiguiente
      paso={paso}
      ahoraServidor={AHORA.getTime()}
      puedeEjecutar={opciones.puedeEjecutar ?? true}
      variante="ficha"
    />
  )
}

describe("PasoSiguiente", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("la acción disponible: qué hacer, su plazo y el botón directo", () => {
    pintar({
      tipo: "accion",
      accion: accion("PUBLICAR", "2026-10-26T16:00:00.000Z"),
    })
    expect(screen.getByText("Publica y carga la evidencia")).toBeVisible()
    const plazo = screen.getByText(/^Vence en 4 h/)
    expect(plazo.closest("time")).toHaveTextContent("Vence en 4 h (urgente)")
    expect(
      screen.getByRole("link", { name: "Cargar la evidencia" })
    ).toHaveAttribute("href", `/mis-campanas/${ASIGNACION_ID}/evidencia`)
  })

  it("un corte que aún no se cumple dice cuándo se habilita", () => {
    pintar({
      tipo: "accion",
      accion: accion("CARGAR_METRICA_H72", "2026-10-30T12:00:00.000Z", {
        numero: 1,
        corte: "H72",
      }),
    })
    expect(screen.getByText(/^Se habilita en 2 días/)).toBeInTheDocument()
    expect(screen.getByText(/Podrás cargarlas desde el/)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Cargar las métricas" })
    ).toHaveAttribute(
      "href",
      `/mis-campanas/${ASIGNACION_ID}/metricas?numero=1&corte=H72`
    )
  })

  it("métricas atrasadas: aún se pueden cargar", () => {
    pintar({
      tipo: "accion",
      accion: accion("CARGAR_METRICA_H24", "2026-10-26T09:00:00.000Z", {
        numero: 1,
        corte: "H24",
      }),
    })
    expect(screen.getByText(/Venció hace 3 h/)).toBeInTheDocument()
    expect(screen.getByText(/Aún puedes cargarlas/)).toBeInTheDocument()
  })

  it("sin permiso para ejecutar no ofrece el botón", () => {
    pintar(
      {
        tipo: "accion",
        accion: accion("DESCARGAR", "2026-10-30T12:00:00.000Z"),
      },
      { puedeEjecutar: false }
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("una vencida con el reclamo abierto muestra el plazo", () => {
    pintar({ tipo: "reclamo", hasta: "2026-10-28T12:00:00.000Z" })
    expect(
      screen.getByText("Puedes reclamar si publicaste a tiempo")
    ).toBeVisible()
    expect(screen.getByText(/^Reclama en 2 días/)).toBeInTheDocument()
    expect(screen.getByText(/el equipo AMO lo atiende/)).toBeInTheDocument()
  })

  it("con el reclamo cerrado, lo dice", () => {
    pintar({ tipo: "reclamo", hasta: "2026-10-20T12:00:00.000Z" })
    expect(screen.getByText("El plazo para publicar se venció")).toBeVisible()
    expect(
      screen.getByText(/El plazo para reclamar terminó el/)
    ).toBeInTheDocument()
  })

  it("la espera y el cierre", () => {
    const { rerender } = pintar({
      tipo: "espera",
      titulo: "Tu evidencia está en revisión",
      descripcion: "El equipo AMO la revisa.",
    })
    expect(screen.getByText("Tu evidencia está en revisión")).toBeVisible()
    rerender(
      <PasoSiguiente
        paso={{
          tipo: "cerrada",
          titulo: "¡Cumpliste!",
          descripcion: "Entra en la próxima liquidación.",
          tono: "exito",
        }}
        ahoraServidor={AHORA.getTime()}
        puedeEjecutar
      />
    )
    expect(screen.getByText("¡Cumpliste!")).toBeVisible()
  })
})
