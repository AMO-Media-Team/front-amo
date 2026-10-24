import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { EstadoAsignacion } from "../estados"
import { ID_AVISO_ESTADO_ASIGNACION } from "../foco"
import {
  BLOQUEO_CANCELAR_EN_DISPUTA,
  BLOQUEO_CANCELAR_LIQUIDADA,
  opcionesGestion,
  type SituacionGestion,
} from "../gestion-asignacion"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  cancelarAsignacion: vi.fn(),
  abrirDisputa: vi.fn(),
}))
vi.mock("../actions", () => ({
  cancelarAsignacion: acciones.cancelarAsignacion,
}))
// «Abrir disputa» usa la acción de `@/features/disputas` (la misma de las partes).
vi.mock("@/features/disputas/actions", () => ({
  abrirDisputa: acciones.abrirDisputa,
}))
// «Verificar» (el de la página) usa la acción de la validación.
vi.mock("@/features/validacion/actions", () => ({
  verificarAsignacion: vi.fn(),
}))
const navegacion = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { verificarEnFicha } from "@/features/validacion/components/verificar-en-ficha"

import { AccionesAsignacion } from "./acciones-asignacion"

const ASIGNACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const DISPUTA = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"
const MEDIO = "0192f3a4-5b6c-7d8e-9f01-0000000000e1"
const ADMIN = [
  "asignaciones.ver",
  "asignaciones.gestionar",
  "medios.ver",
  "medios.suspender",
  "disputas.ver",
  "disputas.abrir",
]

/** La ficha: el aviso del estado (destino del foco) y las acciones. */
function Ficha({
  estado,
  situacion = {},
  permisos = ADMIN,
  disposicion = "cabecera",
  verificar,
}: {
  estado: EstadoAsignacion
  situacion?: Partial<SituacionGestion>
  permisos?: readonly string[]
  disposicion?: "cabecera" | "pie"
  verificar?: React.ReactNode
}) {
  return (
    <>
      <section
        id={ID_AVISO_ESTADO_ASIGNACION}
        tabIndex={-1}
        aria-label={`Estado: ${estado}`}
      />
      <AccionesAsignacion
        asignacion={{
          id: ASIGNACION,
          titulo: "Reel de Halloween",
          estado,
          medio: { id: MEDIO, nombre: "Radio Pasto" },
        }}
        gestion={opcionesGestion(
          { estado, medioEstado: "VERIFICADO", disputas: [], ...situacion },
          permisos
        )}
        disposicion={disposicion}
        verificar={verificar}
        enlaces={{ medio: true, disputas: true }}
      />
    </>
  )
}

beforeEach(() => {
  acciones.cancelarAsignacion
    .mockReset()
    .mockResolvedValue(exito({ medioSuspendido: false }))
  acciones.abrirDisputa
    .mockReset()
    .mockResolvedValue(exito({ disputaId: DISPUTA }))
  navegacion.push.mockReset()
  avisos.success.mockReset()
})

describe("AccionesAsignacion · botones", () => {
  it("publicada: abrir disputa y cancelar", () => {
    render(<Ficha estado="PUBLICADA" />)
    expect(
      screen.getByRole("button", { name: "Abrir disputa" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Cancelar asignación" })
    ).not.toHaveAccessibleDescription()
  })

  it("sin permisos de gestión no hay nada", () => {
    const { container } = render(
      <AccionesAsignacion
        asignacion={{
          id: ASIGNACION,
          titulo: "Reel de Halloween",
          estado: "PUBLICADA",
          medio: { id: MEDIO, nombre: "Radio Pasto" },
        }}
        gestion={opcionesGestion(
          { estado: "PUBLICADA", medioEstado: "VERIFICADO", disputas: [] },
          ["asignaciones.ver"]
        )}
        disposicion="cabecera"
        enlaces={{ medio: true, disputas: true }}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("liquidada: cancelar se explica en lugar de confirmarse", async () => {
    const usuario = userEvent.setup()
    render(<Ficha estado="LIQUIDADA" />)
    const cancelar = screen.getByRole("button", { name: "Cancelar asignación" })
    expect(cancelar).toHaveAccessibleDescription(BLOQUEO_CANCELAR_LIQUIDADA)
    await usuario.click(cancelar)
    const dialogo = screen.getByRole("alertdialog", {
      name: "No se puede cancelar ahora",
    })
    expect(dialogo).toHaveAccessibleDescription(BLOQUEO_CANCELAR_LIQUIDADA)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Entendido" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(cancelar).toHaveFocus()
    expect(acciones.cancelarAsignacion).not.toHaveBeenCalled()
  })

  it("en disputa: enlaza a la disputa abierta y explica por qué no se cancela", async () => {
    const usuario = userEvent.setup()
    render(
      <Ficha
        estado="EN_DISPUTA"
        situacion={{ disputas: [{ id: DISPUTA, estado: "ABIERTA" }] }}
      />
    )
    expect(
      screen.getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/operacion/disputas/${DISPUTA}`)
    expect(
      screen.queryByRole("button", { name: "Abrir disputa" })
    ).not.toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar asignación" })
    )
    const dialogo = screen.getByRole("alertdialog")
    expect(dialogo).toHaveAccessibleDescription(BLOQUEO_CANCELAR_EN_DISPUTA)
    expect(
      within(dialogo).getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/operacion/disputas/${DISPUTA}`)
  })
})

describe("AccionesAsignacion · cancelar (ADM-010)", () => {
  it("exige causa y motivo, y asocia cada error a su campo", async () => {
    const usuario = userEvent.setup()
    render(<Ficha estado="PUBLICADA" />)
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar asignación" })
    )
    const dialogo = screen.getByRole("dialog", {
      name: "¿Cancelar la asignación?",
    })
    expect(
      within(dialogo).getByRole("list", { name: "Qué pasa al cancelar" })
    ).toHaveTextContent("El medio ya publicó, pero no recibe el pago")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar asignación" })
    )
    const causas = within(dialogo).getByRole("radiogroup", { name: "Causa" })
    expect(causas).toHaveAccessibleDescription(
      "Elige la causa de la cancelación."
    )
    expect(
      within(dialogo).getByRole("radio", { name: "Administrativa" })
    ).toHaveFocus()

    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Administrativa" })
    )
    expect(causas).not.toHaveAccessibleDescription()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar asignación" })
    )
    const motivo = within(dialogo).getByRole("textbox", { name: "Motivo" })
    expect(motivo).toHaveAccessibleDescription(/Describe el motivo/)
    expect(motivo).toHaveFocus()
    expect(acciones.cancelarAsignacion).not.toHaveBeenCalled()
    // Sin fraude ni incumplimiento no se ofrece suspender.
    expect(within(dialogo).queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("por fraude, con un motivo frecuente, suspende al medio y lleva el foco al aviso", async () => {
    acciones.cancelarAsignacion.mockResolvedValue(
      exito({ medioSuspendido: true })
    )
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="METRICAS_CARGADAS" />)
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar asignación" })
    )
    const dialogo = screen.getByRole("dialog")
    await usuario.click(within(dialogo).getByRole("radio", { name: "Fraude" }))
    const sugerencia = within(dialogo).getByRole("button", {
      name: /la captura fue alterada/,
    })
    await usuario.click(sugerencia)
    expect(sugerencia).toHaveAttribute("aria-pressed", "true")
    const suspender = within(dialogo).getByRole("checkbox", {
      name: "Suspender también a Radio Pasto",
    })
    await usuario.click(suspender)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar asignación" })
    )
    await waitFor(() =>
      expect(acciones.cancelarAsignacion).toHaveBeenCalledWith({
        asignacionId: ASIGNACION,
        estadoVisto: "METRICAS_CARGADAS",
        causa: "FRAUDE",
        motivo:
          "Las métricas reportadas no coinciden con las de la plataforma: la captura fue alterada.",
        suspenderMedio: true,
      })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(avisos.success).toHaveBeenCalledWith(
      "Asignación cancelada",
      expect.objectContaining({
        description: "Fraude · Radio Pasto quedó suspendido.",
        action: expect.objectContaining({ label: "Ver el medio" }),
      })
    )
    // Cancelada, la cabecera ya no ofrece cancelar: el foco queda en el aviso.
    rerender(<Ficha estado="CANCELADA" />)
    expect(
      screen.queryByRole("button", { name: "Cancelar asignación" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Estado: CANCELADA" })
    ).toHaveFocus()
  })

  it("cambiar a una causa sin suspensión desmarca la casilla", async () => {
    const usuario = userEvent.setup()
    render(<Ficha estado="PUBLICADA" />)
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar asignación" })
    )
    const dialogo = screen.getByRole("dialog")
    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Incumplimiento del medio" })
    )
    await usuario.click(within(dialogo).getByRole("checkbox"))
    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Acuerdo entre las partes" })
    )
    expect(within(dialogo).queryByRole("checkbox")).not.toBeInTheDocument()
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Motivo" }),
      "Acordaron no continuar."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar asignación" })
    )
    await waitFor(() =>
      expect(acciones.cancelarAsignacion).toHaveBeenCalledWith(
        expect.objectContaining({ causa: "ACUERDO", suspenderMedio: false })
      )
    )
  })

  it("sin permiso de suspender lo explica en lugar de la casilla", async () => {
    const usuario = userEvent.setup()
    render(
      <Ficha
        estado="PUBLICADA"
        permisos={ADMIN.filter((permiso) => permiso !== "medios.suspender")}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Cancelar asignación" })
    )
    const dialogo = screen.getByRole("dialog")
    await usuario.click(within(dialogo).getByRole("radio", { name: "Fraude" }))
    expect(within(dialogo).queryByRole("checkbox")).not.toBeInTheDocument()
    expect(dialogo).toHaveTextContent(
      "No tienes permiso para suspender medios."
    )
  })

  it("un fallo de la BD queda en el diálogo y lo mantiene abierto", async () => {
    acciones.cancelarAsignacion.mockResolvedValue(
      fallo(BLOQUEO_CANCELAR_LIQUIDADA)
    )
    const usuario = userEvent.setup()
    render(<Ficha estado="VERIFICADA" />)
    const cancelar = screen.getByRole("button", { name: "Cancelar asignación" })
    await usuario.click(cancelar)
    const dialogo = screen.getByRole("dialog")
    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Administrativa" })
    )
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Motivo" }),
      "Error de configuración de la oferta."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar asignación" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      BLOQUEO_CANCELAR_LIQUIDADA
    )
    expect(avisos.success).not.toHaveBeenCalled()
    await usuario.click(within(dialogo).getByRole("button", { name: "Volver" }))
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(cancelar).toHaveFocus()
  })
})

describe("AccionesAsignacion · disputa (ADM-011)", () => {
  it("exige motivo y descripción; abierta, avisa y lleva el foco al aviso", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="VERIFICADA" />)
    await usuario.click(screen.getByRole("button", { name: "Abrir disputa" }))
    const dialogo = screen.getByRole("dialog", { name: "¿Abrir una disputa?" })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Abrir disputa" })
    )
    expect(
      within(dialogo).getByRole("radiogroup", { name: "Motivo" })
    ).toHaveAccessibleDescription("Elige el motivo.")
    // Los motivos del equipo, con su ayuda en la voz interna.
    expect(within(dialogo).getAllByRole("radio")).toHaveLength(6)
    expect(
      within(dialogo).getByRole("radio", { name: "Otro motivo" })
    ).toHaveAccessibleDescription(
      "Algo distinto de lo anterior: la descripción lo explica."
    )

    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Permanencia" })
    )
    expect(
      within(dialogo).getByRole("list", { name: "Qué pasa al abrirla" })
    ).toHaveTextContent("La publicación queda marcada como retirada.")
    const descripcion = within(dialogo).getByRole("textbox", {
      name: "Qué pasó",
    })
    await usuario.type(descripcion, "Se borró")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Abrir disputa" })
    )
    expect(descripcion).toHaveAccessibleDescription(/al menos 10/)
    expect(descripcion).toHaveFocus()

    await usuario.type(descripcion, " el post al segundo día.")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Abrir disputa" })
    )
    await waitFor(() =>
      expect(acciones.abrirDisputa).toHaveBeenCalledWith({
        asignacionId: ASIGNACION,
        motivo: "PERMANENCIA",
        descripcion: "Se borró el post al segundo día.",
      })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(avisos.success).toHaveBeenCalledWith(
      "Disputa abierta",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Ver la disputa" }),
      })
    )
    const [, opciones] = avisos.success.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ]
    opciones.action.onClick()
    expect(navegacion.push).toHaveBeenCalledWith(
      `/operacion/disputas/${DISPUTA}`
    )

    rerender(
      <Ficha
        estado="EN_DISPUTA"
        situacion={{ disputas: [{ id: DISPUTA, estado: "ABIERTA" }] }}
      />
    )
    expect(
      screen.getByRole("region", { name: "Estado: EN_DISPUTA" })
    ).toHaveFocus()
  })
})

describe("AccionesAsignacion · pie del celular", () => {
  it("reúne «Verificar» y la gestión en una región con nombre", () => {
    render(
      <Ficha
        estado="METRICAS_CARGADAS"
        disposicion="pie"
        verificar={<button type="button">Verificar</button>}
      />
    )
    const pie = screen.getByRole("region", {
      name: "Acciones de la asignación",
    })
    expect(
      within(pie)
        .getAllByRole("button")
        .map((boton) => boton.textContent)
    ).toEqual(["Verificar", "Abrir disputa", "Cancelar asignación"])
  })

  it("sin acciones no deja un pie vacío", () => {
    render(<Ficha estado="CANCELADA" disposicion="pie" />)
    expect(
      screen.queryByRole("region", { name: "Acciones de la asignación" })
    ).not.toBeInTheDocument()
  })

  /** Lo que la página pasa como «Verificar» (U2): nada si no aplica. */
  function verificarDeLaPagina(
    estado: EstadoAsignacion,
    puedeVerificar = true
  ) {
    return verificarEnFicha({
      asignacionId: ASIGNACION,
      estado,
      publicaciones: [],
      cortesRequeridos: ["H24"],
      puedeVerificar,
      puedeConstanciaManual: false,
    })
  }

  it("con el «Verificar» de la página, fuera de «Métricas cargadas» tampoco hay pie", () => {
    for (const estado of ["CANCELADA", "VERIFICADA", "PAGADA"] as const) {
      const { unmount } = render(
        <Ficha
          estado={estado}
          disposicion="pie"
          permisos={["asignaciones.ver"]}
          verificar={verificarDeLaPagina(estado)}
        />
      )
      expect(
        screen.queryByRole("region", { name: "Acciones de la asignación" })
      ).not.toBeInTheDocument()
      unmount()
    }
    // Sin `metricas.validar` tampoco, aunque esté en «Métricas cargadas».
    render(
      <Ficha
        estado="METRICAS_CARGADAS"
        disposicion="pie"
        permisos={["asignaciones.ver"]}
        verificar={verificarDeLaPagina("METRICAS_CARGADAS", false)}
      />
    )
    expect(
      screen.queryByRole("region", { name: "Acciones de la asignación" })
    ).not.toBeInTheDocument()
  })

  it("con el «Verificar» de la página en «Métricas cargadas», el pie lo muestra", () => {
    render(
      <Ficha
        estado="METRICAS_CARGADAS"
        disposicion="pie"
        permisos={["asignaciones.ver"]}
        verificar={verificarDeLaPagina("METRICAS_CARGADAS")}
      />
    )
    const pie = screen.getByRole("region", {
      name: "Acciones de la asignación",
    })
    expect(
      within(pie).getByRole("button", { name: /Verificar/ })
    ).toBeInTheDocument()
  })
})
