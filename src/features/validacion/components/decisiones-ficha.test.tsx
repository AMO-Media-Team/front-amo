import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  type CorteMetrica,
  leerDetalleAlertas,
} from "@/features/operacion/metricas"
import type { PublicacionEvidencia } from "@/features/operacion/tipos"
import { exito } from "@/lib/result"

import { type AccionesCorte, BLOQUEO_EVIDENCIA_SIN_APROBAR } from "../decision"
import { MENSAJES_VALIDACION } from "../errores"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  validarEvidencia: vi.fn(),
  validarMetrica: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import {
  DecisionCorte,
  DecisionEvidencia,
  idCorte,
  idPublicacion,
} from "./decisiones-ficha"

const PUBLICACION = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000b1",
  numero: 1,
  url: "https://www.instagram.com/p/abc/",
  estado: "PENDIENTE",
} as PublicacionEvidencia

function corte(cambios: Partial<CorteMetrica> = {}): CorteMetrica {
  return {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000c1",
    publicacionId: PUBLICACION.id,
    corte: "H24",
    fechaCorte: "2026-10-22T15:00:00Z",
    alcance: 95000,
    impresiones: 120000,
    interacciones: 300,
    clics: null,
    estado: "PENDIENTE",
    alertaDesviacion: false,
    alertaMultiplo: false,
    detalleAlertas: leerDetalleAlertas({}),
    observaciones: null,
    validadaAt: null,
    conImagen: false,
    ...cambios,
  } as CorteMetrica
}

const VALIDAR: AccionesCorte = {
  validar: true,
  bloqueoAprobar: null,
  corregir: false,
}

beforeEach(() => {
  acciones.validarEvidencia.mockReset().mockResolvedValue(
    exito({
      asignacionId: "a",
      estadoAsignacion: "EVIDENCIA_VALIDADA",
      fechaLimitePublicacion: null,
    })
  )
  acciones.validarMetrica.mockReset().mockResolvedValue(
    exito({
      asignacionId: "a",
      estadoAsignacion: "EVIDENCIA_VALIDADA",
      fechaLimitePublicacion: null,
    })
  )
  avisos.success.mockReset()
})

describe("DecisionEvidencia (ficha)", () => {
  function Ficha({ pendiente = true }: { pendiente?: boolean }) {
    return (
      <article>
        <h3 id={idPublicacion(PUBLICACION.id)} tabIndex={-1}>
          Publicación
        </h3>
        {pendiente ? <DecisionEvidencia publicacion={PUBLICACION} /> : null}
      </article>
    )
  }

  it("aprobar exige la casilla de la etiqueta y lleva el foco a la publicación", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha />)
    await usuario.click(
      screen.getByRole("button", { name: "Aprobar evidencia" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar la evidencia?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar evidencia" })
    )
    const casilla = within(dialogo).getByRole("checkbox", {
      name: "La etiqueta de publicidad es visible",
    })
    await waitFor(() => expect(casilla).toHaveAttribute("aria-invalid", "true"))
    expect(casilla).toHaveAccessibleDescription(
      MENSAJES_VALIDACION.etiquetaRequerida
    )
    expect(acciones.validarEvidencia).not.toHaveBeenCalled()

    await usuario.click(casilla)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar evidencia" })
    )
    expect(acciones.validarEvidencia).toHaveBeenCalledWith({
      aprobar: true,
      publicacionId: PUBLICACION.id,
      etiquetaVerificada: true,
      observaciones: "",
    })
    rerender(<Ficha pendiente={false} />)
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Publicación" })).toHaveFocus()
    )
  })

  it("rechazar pide observaciones para el medio", async () => {
    const usuario = userEvent.setup()
    render(<Ficha />)
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Rechazar la evidencia?",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox"),
      "La captura no corresponde al post."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar evidencia" })
    )
    expect(acciones.validarEvidencia).toHaveBeenCalledWith({
      aprobar: false,
      publicacionId: PUBLICACION.id,
      observaciones: "La captura no corresponde al post.",
    })
  })
})

describe("DecisionCorte (ficha)", () => {
  function Fila({
    valor,
    acciones: permitidas = VALIDAR,
    onCorregir = () => {},
  }: {
    valor: CorteMetrica
    acciones?: AccionesCorte
    onCorregir?: () => void
  }) {
    return (
      <div>
        <span id={idCorte(valor.id)} tabIndex={-1}>
          24 horas
        </span>
        <p id="bloqueo">{permitidas.bloqueoAprobar}</p>
        <DecisionCorte
          corte={valor}
          plataforma="INSTAGRAM"
          acciones={permitidas}
          idBloqueo="bloqueo"
          onCorregir={onCorregir}
        />
      </div>
    )
  }

  it("con alerta, aprobar exige anotar qué se revisó (con sus razones a la vista)", async () => {
    const usuario = userEvent.setup()
    const conAlerta = corte({
      alertaMultiplo: true,
      detalleAlertas: leerDetalleAlertas({
        multiplo: 2,
        seguidores: 40000,
        alcance: 95000,
        limite_alcance: 80000,
      }),
    })
    const { rerender } = render(<Fila valor={conAlerta} />)
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar las métricas de 24 horas con alerta?",
    })
    expect(dialogo).toHaveTextContent(/supera/)
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Comparé las cifras con la captura del panel y coinciden.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )
    expect(acciones.validarMetrica).toHaveBeenCalledWith({
      aprobar: true,
      metricaId: conAlerta.id,
      conAlerta: true,
      observaciones: "Comparé las cifras con la captura del panel y coinciden.",
    })
    rerender(
      <Fila
        valor={{ ...conAlerta, estado: "APROBADA" }}
        acciones={{ validar: false, bloqueoAprobar: null, corregir: false }}
      />
    )
    await waitFor(() => expect(screen.getByText("24 horas")).toHaveFocus())
  })

  it("sin alerta, aprobar solo se confirma", async () => {
    const usuario = userEvent.setup()
    render(<Fila valor={corte()} />)
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar las métricas de 24 horas?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )
    expect(acciones.validarMetrica).toHaveBeenCalledWith({
      aprobar: true,
      metricaId: corte().id,
      conAlerta: false,
      observaciones: "",
    })
  })

  it("sin la evidencia aprobada, «Aprobar» queda deshabilitado y explicado", () => {
    render(
      <Fila
        valor={corte()}
        acciones={{ ...VALIDAR, bloqueoAprobar: BLOQUEO_EVIDENCIA_SIN_APROBAR }}
      />
    )
    const aprobar = screen.getByRole("button", { name: "Aprobar" })
    expect(aprobar).toBeDisabled()
    expect(aprobar).toHaveAccessibleDescription(BLOQUEO_EVIDENCIA_SIN_APROBAR)
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeEnabled()
  })

  it("«Corregir» aparece solo con permiso y avisa a quien lo monta", async () => {
    const usuario = userEvent.setup()
    const onCorregir = vi.fn()
    const { rerender } = render(
      <Fila
        valor={corte({ estado: "APROBADA" })}
        acciones={{ validar: false, bloqueoAprobar: null, corregir: true }}
        onCorregir={onCorregir}
      />
    )
    await usuario.click(screen.getByRole("button", { name: "Corregir" }))
    expect(onCorregir).toHaveBeenCalledTimes(1)
    rerender(
      <Fila
        valor={corte({ estado: "APROBADA" })}
        acciones={{ validar: false, bloqueoAprobar: null, corregir: false }}
      />
    )
    expect(screen.queryByRole("group")).toBeNull()
  })
})
