import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { leerAlerta, SIN_ALERTA } from "@/features/operacion/alertas"
import type { CorteMetrica } from "@/features/operacion/metricas"
import type { PublicacionEvidencia } from "@/features/operacion/tipos"
import { exito, fallo } from "@/lib/result"

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
const navegacion = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))

import {
  DecisionCorte,
  DecisionEvidencia,
  idCorte,
  idPublicacion,
} from "./decisiones-ficha"

/** `updated_at` tal cual lo entrega la BD: la versión que muestra la ficha. */
const VERSION = "2026-10-22T16:00:00.123456+00:00"
const VERSION_NUEVA = "2026-10-22T17:45:00.000002+00:00"

const PUBLICACION = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000b1",
  numero: 1,
  url: "https://www.instagram.com/p/abc/",
  estado: "PENDIENTE",
  actualizadaAt: VERSION,
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
    alerta: SIN_ALERTA,
    observaciones: null,
    validadaAt: null,
    conImagen: false,
    actualizadaAt: VERSION,
    ...cambios,
  } as CorteMetrica
}

const VALIDAR: AccionesCorte = {
  validar: true,
  bloqueoAprobar: null,
  rechazoEnDisputa: false,
  corregir: false,
}

const SIN_ACCIONES: AccionesCorte = {
  ...VALIDAR,
  validar: false,
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
  navegacion.refresh.mockReset()
})

describe("DecisionEvidencia (ficha)", () => {
  function Ficha({
    pendiente = true,
    publicacion = PUBLICACION,
  }: {
    pendiente?: boolean
    publicacion?: PublicacionEvidencia
  }) {
    return (
      <article>
        <h3 id={idPublicacion(publicacion.id)} tabIndex={-1}>
          Publicación
        </h3>
        {pendiente ? <DecisionEvidencia publicacion={publicacion} /> : null}
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
      enviadaAt: VERSION,
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
    // El estado con el nombre que muestran las insignias (U6).
    expect(dialogo).toHaveTextContent("vuelve a «Contenido descargado»")
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
      enviadaAt: VERSION,
    })
  })

  it("decide sobre la versión que se veía al abrir, aunque la ficha se refresque", async () => {
    acciones.validarEvidencia.mockResolvedValueOnce(
      fallo(MENSAJES_VALIDACION.evidenciaCambiada)
    )
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha />)
    await usuario.click(
      screen.getByRole("button", { name: "Aprobar evidencia" })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar la evidencia?",
    })
    // Otro refresco trae la versión nueva con el diálogo abierto.
    rerender(
      <Ficha publicacion={{ ...PUBLICACION, actualizadaAt: VERSION_NUEVA }} />
    )
    await usuario.click(
      within(dialogo).getByRole("checkbox", {
        name: "La etiqueta de publicidad es visible",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar evidencia" })
    )
    expect(acciones.validarEvidencia).toHaveBeenCalledWith(
      expect.objectContaining({ enviadaAt: VERSION })
    )
    // La BD no decidió: se explica y, al cerrar, la ficha muestra la nueva.
    expect(
      await within(dialogo).findByText(MENSAJES_VALIDACION.evidenciaCambiada)
    ).toBeInTheDocument()
    expect(navegacion.refresh).not.toHaveBeenCalled()
    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(navegacion.refresh).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Publicación" })).toHaveFocus()
    )

    // Al volver a abrirlo, se decide sobre la versión nueva.
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const rechazo = await screen.findByRole("alertdialog", {
      name: "¿Rechazar la evidencia?",
    })
    await usuario.type(
      within(rechazo).getByRole("textbox"),
      "La captura no corresponde al post."
    )
    await usuario.click(
      within(rechazo).getByRole("button", { name: "Rechazar evidencia" })
    )
    expect(acciones.validarEvidencia).toHaveBeenLastCalledWith(
      expect.objectContaining({ aprobar: false, enviadaAt: VERSION_NUEVA })
    )
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
      alerta: leerAlerta({
        alerta_desviacion: false,
        alerta_multiplo: true,
        detalle_alertas: {
          multiplo: 2,
          seguidores: 40000,
          alcance: 95000,
          limite_alcance: 80000,
        },
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
      enviadaAt: VERSION,
    })
    rerender(
      <Fila
        valor={{ ...conAlerta, estado: "APROBADA" }}
        acciones={SIN_ACCIONES}
      />
    )
    await waitFor(() => expect(screen.getByText("24 horas")).toHaveFocus())
  })

  it("una corregida que tuvo alerta también exige anotar qué se revisó", async () => {
    const usuario = userEvent.setup()
    const corregida = corte({
      alerta: leerAlerta({
        alerta_desviacion: false,
        alerta_multiplo: false,
        detalle_alertas: {
          alcance: 60000,
          alerta_previa: {
            multiplo: 2,
            seguidores: 40000,
            alcance: 95000,
            limite_alcance: 80000,
            multiplo_superado: true,
          },
        },
      }),
    })
    render(<Fila valor={corregida} />)
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar las métricas de 24 horas con alerta?",
    })
    expect(dialogo).toHaveTextContent("Tuvo alerta antes de corregirse.")
    expect(dialogo).toHaveTextContent(/El alcance \(95\.000\) supera/)
  })

  it("si el rechazo espera a la disputa, solo se ofrece aprobar", () => {
    render(
      <Fila valor={corte()} acciones={{ ...VALIDAR, rechazoEnDisputa: true }} />
    )
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })

  it("si la BD responde que espera a la disputa, al cerrar refresca la ficha", async () => {
    acciones.validarMetrica.mockResolvedValueOnce(
      fallo(MENSAJES_VALIDACION.enDisputaRechazoMetrica)
    )
    const usuario = userEvent.setup()
    render(<Fila valor={corte()} />)
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Rechazar las métricas de 24 horas?",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox"),
      "Las cifras no coinciden con la captura."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar" })
    )
    expect(
      await within(dialogo).findByText(
        MENSAJES_VALIDACION.enDisputaRechazoMetrica
      )
    ).toBeInTheDocument()
    expect(navegacion.refresh).not.toHaveBeenCalled()
    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(navegacion.refresh).toHaveBeenCalledTimes(1))
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
      enviadaAt: VERSION,
    })
  })

  it("si el medio cambió las cifras, no aprueba y al cerrar muestra las nuevas", async () => {
    acciones.validarMetrica.mockResolvedValueOnce(
      fallo(MENSAJES_VALIDACION.metricaCambiada)
    )
    const usuario = userEvent.setup()
    render(<Fila valor={corte()} />)
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Aprobar las métricas de 24 horas?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Aprobar" })
    )
    expect(
      await within(dialogo).findByText(MENSAJES_VALIDACION.metricaCambiada)
    ).toBeInTheDocument()
    expect(avisos.success).not.toHaveBeenCalled()
    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(navegacion.refresh).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText("24 horas")).toHaveFocus())
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
        acciones={{ ...SIN_ACCIONES, corregir: true }}
        onCorregir={onCorregir}
      />
    )
    await usuario.click(screen.getByRole("button", { name: "Corregir" }))
    expect(onCorregir).toHaveBeenCalledTimes(1)
    rerender(
      <Fila valor={corte({ estado: "APROBADA" })} acciones={SIN_ACCIONES} />
    )
    expect(screen.queryByRole("group")).toBeNull()
  })
})
