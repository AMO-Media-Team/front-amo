import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import { ID_TITULO_COLA } from "../colas"
import { frasePermanenciaPendiente } from "../decision"
import type { AsignacionPorVerificar } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ verificarAsignacion: vi.fn() }))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { ListaPorVerificar } from "./lista-por-verificar"

const MANANA = "2026-10-24T15:00:00Z"

function fila(
  numero: number,
  cambios: Partial<AsignacionPorVerificar> = {}
): AsignacionPorVerificar {
  return {
    asignacionId: `0192f3a4-5b6c-7d8e-9f01-0000000000a${numero}`,
    ofertaTitulo: `Oferta ${numero}`,
    marca: "Marca",
    medio: {
      id: `0192f3a4-5b6c-7d8e-9f01-0000000000c${numero}`,
      nombre: `Medio ${numero}`,
      handle: null,
    },
    plataforma: "FACEBOOK",
    publicaciones: 1,
    metricasCargadasAt: "2026-10-22T15:00:00Z",
    cortesRequeridos: 2,
    cortesAprobados: 2,
    metricasPendientes: 0,
    metricasConAlerta: 0,
    permanenciaHasta: null,
    lista: true,
    bloqueo: null,
    ...cambios,
  }
}

const LISTA = fila(1, { metricasConAlerta: 1 })
const SIN_METRICAS = fila(2, {
  lista: false,
  bloqueo: "METRICAS",
  cortesAprobados: 1,
  metricasPendientes: 1,
})
const SIN_PERMANENCIA = fila(3, {
  lista: false,
  bloqueo: "PERMANENCIA",
  permanenciaHasta: MANANA,
})

beforeEach(() => {
  acciones.verificarAsignacion.mockReset().mockResolvedValue(exito())
  avisos.success.mockReset()
})

function renderizar(constanciaManual = false) {
  const usuario = userEvent.setup()
  const resultado = render(
    <section>
      <h2 id={ID_TITULO_COLA} tabIndex={-1}>
        Por verificar
      </h2>
      <ListaPorVerificar
        filas={[LISTA, SIN_METRICAS, SIN_PERMANENCIA]}
        constanciaManual={constanciaManual}
      />
    </section>
  )
  const tarjetas = within(
    screen.getByRole("list", { name: "Asignaciones por verificar" })
  ).getAllByRole("listitem")
  return { usuario, tarjetas, ...resultado }
}

describe("ListaPorVerificar (ADM-009)", () => {
  it("las bloqueadas dicen por qué y ofrecen el camino para resolverlo", () => {
    const { tarjetas } = renderizar()
    expect(tarjetas[0]).toHaveTextContent("Lista para verificar")
    expect(tarjetas[0]).toHaveTextContent("1 métrica tuvo alerta")
    expect(tarjetas[1]).toHaveTextContent(
      "Faltan métricas por aprobar: 1 corte sin aprobar y 1 métrica pendiente de revisión."
    )
    expect(
      within(tarjetas[1]).getByRole("link", {
        name: "Ir a la cola de métricas",
      })
    ).toHaveAttribute("href", "/operacion/validacion?cola=metricas")
    // `toHaveTextContent` normaliza los espacios fijos de la hora.
    expect(tarjetas[2]).toHaveTextContent(
      frasePermanenciaPendiente(MANANA).replace(/\s/g, " ")
    )
    expect(within(tarjetas[1]).queryByRole("button")).toBeNull()
    expect(within(tarjetas[2]).queryByRole("button")).toBeNull()
  })

  it("verifica la lista con una confirmación y deja el foco en la cola", async () => {
    const { usuario, tarjetas } = renderizar()
    await usuario.click(
      within(tarjetas[0]).getByRole("button", {
        name: "Verificar Medio 1: Oferta 1",
      })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Verificar la asignación?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar" })
    )
    expect(acciones.verificarAsignacion).toHaveBeenCalledWith({
      asignacionId: LISTA.asignacionId,
      constancia: false,
      motivo: "",
    })
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Por verificar" })
      ).toHaveFocus()
    )
  })

  it("con permiso, la de permanencia pendiente se verifica con constancia", async () => {
    const { usuario, tarjetas } = renderizar(true)
    await usuario.click(
      within(tarjetas[2]).getByRole("button", {
        name: /^Verificar con constancia de permanencia/,
      })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Verificar antes de cumplir la permanencia?",
    })
    await usuario.type(
      within(dialogo).getByRole("textbox"),
      "Abrí la publicación hoy y sigue en línea."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Verificar con constancia" })
    )
    expect(acciones.verificarAsignacion).toHaveBeenCalledWith({
      asignacionId: SIN_PERMANENCIA.asignacionId,
      constancia: true,
      motivo: "Abrí la publicación hoy y sigue en línea.",
    })
  })
})
