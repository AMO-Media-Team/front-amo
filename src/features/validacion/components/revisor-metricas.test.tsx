import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { VALORES_VACIOS } from "@/features/ejecucion/campos-metricas"
import { formatearNumero } from "@/lib/format"
import { leerAlerta, SIN_ALERTA } from "@/features/operacion/alertas"
import { exito, fallo } from "@/lib/result"

import {
  BLOQUEO_EVIDENCIA_SIN_APROBAR,
  TEXTO_SE_DECIDE_EN_DISPUTA,
} from "../decision"
import { MENSAJES_VALIDACION } from "../errores"
import type { MetricaEnCola } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ validarMetrica: vi.fn() }))
vi.mock("../actions", () => acciones)
const firmas = vi.hoisted(() => ({ firmarEvidencias: vi.fn() }))
vi.mock("@/features/operacion/actions", () => firmas)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { RevisorMetricas } from "./revisor-metricas"

function metrica(
  numero: number,
  cambios: Partial<MetricaEnCola> = {}
): MetricaEnCola {
  return {
    metricaId: `0192f3a4-5b6c-7d8e-9f01-00000000000${numero}`,
    publicacionId: `0192f3a4-5b6c-7d8e-9f01-0000000000b${numero}`,
    asignacionId: `0192f3a4-5b6c-7d8e-9f01-0000000000a${numero}`,
    numero: 1,
    corte: "H24",
    fechaCorte: "2026-10-22T15:00:00Z",
    periodo: null,
    plataforma: "INSTAGRAM",
    formatoClave: "POST_FEED",
    formato: "Post de feed",
    valores: {
      ...VALORES_VACIOS,
      alcance: 95000,
      impresiones: 120000,
      meGusta: 300,
      comentarios: 10,
      compartidos: 5,
      guardados: 2,
    },
    interacciones: 317,
    conImagen: false,
    alerta: SIN_ALERTA,
    evidenciaAprobada: true,
    enviadaAt: "2026-10-22T16:00:00Z",
    observaciones: null,
    medio: {
      id: `0192f3a4-5b6c-7d8e-9f01-0000000000c${numero}`,
      nombre: `Medio ${numero}`,
      handle: `medio${numero}`,
    },
    seguidoresAlAceptar: 40000,
    ofertaId: `0192f3a4-5b6c-7d8e-9f01-0000000000d${numero}`,
    ofertaTitulo: "Post de lanzamiento",
    estadoAsignacion: "EVIDENCIA_VALIDADA",
    ...cambios,
  }
}

/** INT-004: Instagram con 40.000 seguidores reporta 95.000 de alcance. */
const CON_ALERTA = metrica(1, {
  alerta: leerAlerta({
    alerta_desviacion: false,
    alerta_multiplo: true,
    detalle_alertas: {
      multiplo: 2,
      seguidores: 40000,
      alcance: 95000,
      impresiones: 120000,
      limite_alcance: 80000,
    },
  }),
})

beforeEach(() => {
  acciones.validarMetrica.mockReset().mockResolvedValue(
    exito({
      asignacionId: CON_ALERTA.asignacionId,
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

/** El medio la corrigió: hoy no dispara, pero tuvo alerta (pide constancia). */
const CORREGIDA = metrica(5, {
  alerta: leerAlerta({
    alerta_desviacion: false,
    alerta_multiplo: false,
    detalle_alertas: {
      multiplo: 2,
      seguidores: 40000,
      alcance: 60000,
      limite_alcance: 80000,
      alerta_previa: {
        multiplo: 2,
        seguidores: 40000,
        alcance: 95000,
        limite_alcance: 80000,
        desviacion: false,
        multiplo_superado: true,
      },
    },
  }),
})

describe("RevisorMetricas (ADM-008)", () => {
  it("la tarjeta con alerta dice por qué en una línea", () => {
    render(<RevisorMetricas metricas={[CON_ALERTA, metrica(2)]} />)
    const lista = screen.getByRole("list", { name: "Métricas por validar" })
    const [primera] = within(lista).getAllByRole("listitem")
    expect(primera).toHaveTextContent(
      "Con alerta: Alcance sobre el límite por seguidores"
    )
    expect(
      within(primera).getByRole("button", { name: /\(con alerta\)$/ })
    ).toBeInTheDocument()
  })

  it("una corregida que tuvo alerta cuenta como alerta revisable", async () => {
    const usuario = userEvent.setup()
    render(<RevisorMetricas metricas={[CORREGIDA]} />)
    const tarjeta = screen.getByRole("listitem")
    expect(tarjeta).toHaveTextContent(
      "Tuvo alerta antes de corregirse: Alcance sobre el límite por seguidores"
    )
    await usuario.click(
      within(tarjeta).getByRole("button", { name: /\(con alerta\)$/ })
    )
    const hoja = await screen.findByRole("dialog")
    expect(
      within(hoja).getByRole("region", {
        name: "Tuvo alerta antes de corregirse",
      })
    ).toHaveTextContent(formatearNumero(95000))
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    expect(
      await within(hoja).findByRole("textbox", { name: "Qué revisaste" })
    ).toHaveAttribute("aria-invalid", "true")
    expect(acciones.validarMetrica).not.toHaveBeenCalled()
  })

  it("si el rechazo espera a la disputa, deja de ofrecerlo y lo explica", async () => {
    acciones.validarMetrica.mockResolvedValueOnce(
      fallo(MENSAJES_VALIDACION.enDisputaRechazoMetrica)
    )
    const usuario = userEvent.setup()
    render(<RevisorMetricas metricas={[metrica(6)]} />)
    await usuario.click(screen.getByRole("button", { name: /^Revisar/ }))
    const hoja = await screen.findByRole("dialog")
    await usuario.click(within(hoja).getByRole("button", { name: "Rechazar" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Rechazar la métrica?",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox"),
      "Las cifras no coinciden con la captura."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar métrica" })
    )
    expect(
      await within(dialogo).findByText(
        MENSAJES_VALIDACION.enDisputaRechazoMetrica
      )
    ).toBeInTheDocument()
    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    const nota = within(hoja).getByRole("note")
    expect(nota).toHaveTextContent(TEXTO_SE_DECIDE_EN_DISPUTA)
    expect(
      within(nota).getByRole("link", { name: "Ver la asignación y su disputa" })
    ).toHaveAttribute(
      "href",
      `/operacion/asignaciones/${metrica(6).asignacionId}`
    )
    expect(
      within(hoja).queryByRole("button", { name: "Rechazar" })
    ).not.toBeInTheDocument()
    expect(within(hoja).getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })

  it("muestra el porqué de la alerta junto a las cifras (ADM-008 c1)", async () => {
    const usuario = userEvent.setup()
    render(<RevisorMetricas metricas={[CON_ALERTA]} />)
    await usuario.click(screen.getByRole("button", { name: /^Revisar/ }))
    const hoja = await screen.findByRole("dialog")
    const porque = within(hoja).getByRole("region", {
      name: "Por qué tiene alerta",
    })
    expect(porque).toHaveTextContent("Alcance excesivo frente a los seguidores")
    for (const [etiqueta, valor] of [
      ["Alcance reportado", formatearNumero(95000)],
      ["Seguidores al aceptar", formatearNumero(40000)],
      ["Múltiplo permitido", "2 ×"],
      ["Límite", formatearNumero(80000)],
    ]) {
      expect(within(porque).getByText(etiqueta).nextSibling).toHaveTextContent(
        valor
      )
    }
    expect(
      within(hoja).getByRole("region", { name: "Cifras reportadas" })
    ).toHaveTextContent(formatearNumero(120000))
  })

  it("aprobar una con alerta exige anotar qué se revisó", async () => {
    const usuario = userEvent.setup()
    render(<RevisorMetricas metricas={[CON_ALERTA]} />)
    await usuario.click(screen.getByRole("button", { name: /^Revisar/ }))
    const hoja = await screen.findByRole("dialog")
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    const campo = within(hoja).getByRole("textbox", { name: "Qué revisaste" })
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"))
    expect(campo).toHaveAccessibleDescription(
      expect.stringContaining(MENSAJES_VALIDACION.alertaSinRevision)
    )
    expect(acciones.validarMetrica).not.toHaveBeenCalled()

    await usuario.click(
      within(hoja).getByRole("button", {
        name: "Comparé las cifras con la captura del panel y coinciden.",
      })
    )
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    expect(acciones.validarMetrica).toHaveBeenCalledWith({
      aprobar: true,
      metricaId: CON_ALERTA.metricaId,
      conAlerta: true,
      observaciones: "Comparé las cifras con la captura del panel y coinciden.",
    })
  })

  it("sin la evidencia aprobada no se aprueba y se explica", async () => {
    const usuario = userEvent.setup()
    render(
      <RevisorMetricas metricas={[metrica(3, { evidenciaAprobada: false })]} />
    )
    await usuario.click(screen.getByRole("button", { name: /^Revisar/ }))
    const hoja = await screen.findByRole("dialog")
    const aprobar = within(hoja).getByRole("button", { name: "Aprobar" })
    expect(aprobar).toBeDisabled()
    expect(aprobar).toHaveAccessibleDescription(
      expect.stringContaining(BLOQUEO_EVIDENCIA_SIN_APROBAR)
    )
    expect(
      within(hoja).getByRole("link", { name: "Ir a la cola de evidencias" })
    ).toHaveAttribute("href", "/operacion/validacion?cola=evidencias")
  })

  it("al decidir la última, la hoja se cierra", async () => {
    const usuario = userEvent.setup()
    render(<RevisorMetricas metricas={[metrica(4)]} />)
    await usuario.click(screen.getByRole("button", { name: /^Revisar/ }))
    const hoja = await screen.findByRole("dialog")
    await usuario.click(within(hoja).getByRole("button", { name: "Aprobar" }))
    expect(acciones.validarMetrica).toHaveBeenCalledWith({
      aprobar: true,
      metricaId: metrica(4).metricaId,
      conAlerta: false,
      observaciones: "",
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
