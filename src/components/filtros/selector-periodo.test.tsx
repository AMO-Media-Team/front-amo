import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { rangoDesdePreset, rangoPersonalizado } from "@/lib/fechas"

import {
  opcionesDePresets,
  SelectorPeriodo,
  type SelectorPeriodoProps,
} from "./selector-periodo"

const OPCIONES = opcionesDePresets(["ultimos7", "ultimos30", "esteMes"])
type Opcion = (typeof OPCIONES)[number]["valor"]

function montar(props: Partial<SelectorPeriodoProps<Opcion>> = {}) {
  const onOpcion = vi.fn()
  const onRango = vi.fn()
  const rango = rangoDesdePreset("ultimos7")
  render(
    <SelectorPeriodo
      rango={rango}
      etiqueta="Últimos 7 días"
      opciones={OPCIONES}
      opcionActiva="ultimos7"
      onOpcion={onOpcion}
      onRango={onRango}
      describirRango={() => "rango elegido"}
      {...props}
    />
  )
  return { onOpcion, onRango, rango, usuario: userEvent.setup() }
}

const abrir = async (
  usuario: ReturnType<typeof userEvent.setup>,
  nombre: string | RegExp = "Periodo: Últimos 7 días"
) => {
  await usuario.click(screen.getByRole("button", { name: nombre }))
  return screen.findByRole("dialog")
}

describe("SelectorPeriodo", () => {
  it("el botón dice el periodo y el panel tiene nombre accesible", async () => {
    const { usuario } = montar()
    const panel = await abrir(usuario)
    expect(panel).toHaveAccessibleName("Elegir el periodo")
    const rapidos = within(panel).getByRole("group", {
      name: "Periodos rápidos",
    })
    expect(
      within(rapidos)
        .getAllByRole("button")
        .map((boton) => [boton.textContent, boton.getAttribute("aria-pressed")])
    ).toEqual([
      ["Últimos 7 días", "true"],
      ["Últimos 30 días", "false"],
      ["Este mes", "false"],
    ])
  })

  it("elegir una opción la entrega y cierra el panel", async () => {
    const { usuario, onOpcion, onRango } = montar()
    const panel = await abrir(usuario)
    await usuario.click(within(panel).getByRole("button", { name: "Este mes" }))
    expect(onOpcion).toHaveBeenCalledExactlyOnceWith("esteMes")
    expect(onRango).not.toHaveBeenCalled()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("cada apertura parte del periodo vigente y «Aplicar» lo entrega ordenado", async () => {
    const { usuario, onRango, rango } = montar()
    const panel = await abrir(usuario)
    expect(within(panel).getByText("rango elegido")).toBeInTheDocument()
    await usuario.click(within(panel).getByRole("button", { name: "Aplicar" }))
    expect(onRango).toHaveBeenCalledExactlyOnceWith(
      rangoPersonalizado(rango.desde, rango.hasta)
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("sin periodo vigente pide elegir los días y no deja aplicar", async () => {
    const { usuario } = montar({
      rango: null,
      etiqueta: "Todo el historial",
      opcionActiva: null,
      nombreAccesible: "Creadas en: Todo el historial",
      tituloPanel: "Elegir el periodo de creación",
      nota: "Filtra por la fecha de creación.",
    })
    const panel = await abrir(usuario, "Creadas en: Todo el historial")
    expect(panel).toHaveAccessibleName("Elegir el periodo de creación")
    expect(
      within(panel).getByText("Filtra por la fecha de creación.")
    ).toBeInTheDocument()
    expect(
      within(panel).getByText("Elige el día inicial y el final")
    ).toBeInTheDocument()
    expect(
      within(panel).getByRole("button", { name: "Aplicar" })
    ).toBeDisabled()
  })

  it("un rango mayor al límite se explica y no se puede aplicar", async () => {
    const { usuario, onRango } = montar({
      limite: { dias: 3, mensaje: "Elige un periodo de máximo tres días" },
    })
    const panel = await abrir(usuario)
    expect(
      within(panel).getByText("Elige un periodo de máximo tres días")
    ).toBeInTheDocument()
    const aplicar = within(panel).getByRole("button", { name: "Aplicar" })
    expect(aplicar).toBeDisabled()
    await usuario.click(aplicar)
    expect(onRango).not.toHaveBeenCalled()
  })

  it("con dos meses a la vista no repite los días del mes vecino", async () => {
    const { usuario } = montar()
    const panel = await abrir(usuario)
    expect(within(panel).getAllByRole("grid")).toHaveLength(2)
    // Las celdas del mes vecino quedan vacías: sin día que pulsar ni tramo.
    expect(panel.querySelector("[data-outside='true'] button")).toBeNull()
  })

  it("mientras el servidor responde el botón muestra la carga", () => {
    montar({ cargando: true })
    const boton = screen.getByRole("button", {
      name: "Periodo: Últimos 7 días",
    })
    expect(
      boton.querySelector("[data-slot='spinner'], [role='status']")
    ).not.toBeNull()
  })
})
