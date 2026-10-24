import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CorteMetrica } from "@/features/operacion/metricas"
import type { PublicacionEvidencia } from "@/features/operacion/tipos"
import { exito, fallo } from "@/lib/result"

import { frasePermanenciaPendiente } from "../decision"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ verificarAsignacion: vi.fn() }))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import {
  VerificarAsignacion,
  type VerificarAsignacionProps,
} from "./verificar-asignacion"

const ASIGNACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const AHORA = new Date("2026-10-23T15:00:00Z")
const MANANA = "2026-10-24T15:00:00Z"

function publicacion(
  cortes: Pick<CorteMetrica, "corte" | "estado">[],
  permanenciaHasta = "2026-10-20T15:00:00Z"
): PublicacionEvidencia {
  return {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000b1",
    numero: 1,
    permanenciaHasta,
    permanenciaVerificadaAt: null,
    cortes: cortes as CorteMetrica[],
  } as PublicacionEvidencia
}

function Ficha(props: Partial<VerificarAsignacionProps>) {
  return (
    <main>
      <h1>Reel de Halloween</h1>
      <VerificarAsignacion
        asignacionId={ASIGNACION}
        estado="METRICAS_CARGADAS"
        publicaciones={[publicacion([{ corte: "H24", estado: "APROBADA" }])]}
        cortesRequeridos={["H24"]}
        puedeVerificar
        puedeConstanciaManual={false}
        {...props}
      />
    </main>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  acciones.verificarAsignacion.mockReset().mockResolvedValue(exito())
  avisos.success.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("VerificarAsignacion", () => {
  it("lista: confirma, verifica y lleva el foco al título de la ficha", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha />)
    await usuario.click(screen.getByRole("button", { name: "Verificar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Verificar la asignación?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar" })
    )
    expect(acciones.verificarAsignacion).toHaveBeenCalledWith({
      asignacionId: ASIGNACION,
      constancia: false,
      motivo: "",
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Asignación verificada",
      expect.anything()
    )
    // La ficha se refresca: la asignación ya no espera verificación.
    rerender(<Ficha estado="VERIFICADA" />)
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus()
    )
    expect(screen.queryByRole("button", { name: "Verificar" })).toBeNull()
  })

  it("un fallo de la BD se muestra dentro del diálogo", async () => {
    acciones.verificarAsignacion.mockResolvedValue(
      fallo("Hay métricas pendientes de revisión en esta asignación.")
    )
    const usuario = userEvent.setup()
    render(<Ficha />)
    await usuario.click(screen.getByRole("button", { name: "Verificar" }))
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Hay métricas pendientes de revisión"
    )
  })

  it("con métricas por aprobar queda deshabilitado y dice por qué", () => {
    render(
      <Ficha
        publicaciones={[publicacion([{ corte: "H24", estado: "PENDIENTE" }])]}
      />
    )
    const boton = screen.getByRole("button", { name: "Verificar" })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAccessibleDescription(
      /Faltan métricas por aprobar: 1 corte sin aprobar y 1 métrica pendiente de revisión/
    )
  })

  it("con la permanencia pendiente dice hasta cuándo (ADM-009 c1)", () => {
    render(
      <Ficha
        publicaciones={[
          publicacion([{ corte: "H24", estado: "APROBADA" }], MANANA),
        ]}
      />
    )
    expect(
      screen.getByRole("button", { name: "Verificar" })
    ).toHaveAccessibleDescription(frasePermanenciaPendiente(MANANA))
  })

  it("con permiso, verifica con constancia manual y motivo", async () => {
    const usuario = userEvent.setup()
    render(
      <Ficha
        puedeConstanciaManual
        publicaciones={[
          publicacion([{ corte: "H24", estado: "APROBADA" }], MANANA),
        ]}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Verificar con constancia" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Verificar antes de cumplir la permanencia?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: /sigue en línea y cumple las condiciones/,
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar con constancia" })
    )
    expect(acciones.verificarAsignacion).toHaveBeenCalledWith({
      asignacionId: ASIGNACION,
      constancia: true,
      motivo:
        "Comprobé que la publicación sigue en línea y cumple las condiciones de la oferta.",
    })
  })

  it("fuera de «Métricas cargadas» o sin permiso no muestra nada", () => {
    const { container, rerender } = render(<Ficha estado="PUBLICADA" />)
    expect(container.querySelector("button")).toBeNull()
    rerender(<Ficha puedeVerificar={false} />)
    expect(container.querySelector("button")).toBeNull()
  })
})
