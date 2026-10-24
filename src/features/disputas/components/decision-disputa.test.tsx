import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { ID_ESTADO_DISPUTA } from "../foco"
import {
  type ContextoResolucion,
  decisionesDisputa,
  opcionesResolucion,
} from "../resolucion"
import type { EstadoDisputa } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  tomarDisputa: vi.fn(),
  resolverDisputa: vi.fn(),
  descartarDisputa: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { DecisionDisputa } from "./decision-disputa"

const DISPUTA = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"
const RESOLUTOR = ["disputas.ver", "disputas.resolver"]
const LIBRE = {
  faltanMetricas: false,
  metricasPendientes: false,
  permanenciaHasta: null,
}

function contexto(
  cambios: Partial<ContextoResolucion> = {}
): ContextoResolucion {
  return {
    estadoPrevio: "METRICAS_CARGADAS",
    ofertaCerrada: false,
    verificacion: LIBRE,
    puedeVerificar: true,
    puedeConstanciaManual: false,
    ...cambios,
  }
}

/** La ficha: el aviso del estado (destino del foco) y el panel de decisión. */
function Ficha({
  estado = "ABIERTA",
  permisos = RESOLUTOR,
  resolucion = contexto(),
}: {
  estado?: EstadoDisputa
  permisos?: string[]
  resolucion?: ContextoResolucion
}) {
  return (
    <>
      <section
        id={ID_ESTADO_DISPUTA}
        tabIndex={-1}
        aria-label={`Estado: ${estado}`}
      />
      <DecisionDisputa
        disputa={{ id: DISPUTA, estado, titulo: "Reel de temporada" }}
        opciones={decisionesDisputa(estado, permisos)}
        resolucion={opcionesResolucion(resolucion)}
      />
    </>
  )
}

beforeEach(() => {
  for (const accion of Object.values(acciones)) {
    accion.mockReset().mockResolvedValue(exito())
  }
})

describe("DecisionDisputa", () => {
  it("abierta: resolver, tomar en revisión o descartar", () => {
    render(<Ficha />)
    for (const nombre of ["Resolver", "Tomar en revisión", "Descartar"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeEnabled()
    }
    expect(
      screen.getByRole("heading", { name: "Antes de decidir" })
    ).toBeVisible()
  })

  it("en revisión ya no se toma; sin `disputas.resolver` no hay panel", () => {
    const { unmount } = render(<Ficha estado="EN_REVISION" />)
    expect(
      screen.queryByRole("button", { name: "Tomar en revisión" })
    ).not.toBeInTheDocument()
    unmount()
    render(<Ficha permisos={["disputas.ver"]} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("tomar en revisión confirma, llama a la acción y lleva el foco al estado", async () => {
    const usuario = userEvent.setup()
    render(<Ficha />)
    await usuario.click(
      screen.getByRole("button", { name: "Tomar en revisión" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Tomar la disputa en revisión?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Tomar en revisión" })
    )
    await waitFor(() =>
      expect(acciones.tomarDisputa).toHaveBeenCalledWith({ disputaId: DISPUTA })
    )
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Estado: ABIERTA" })
      ).toHaveFocus()
    )
  })

  it("resolver exige elegir el destino, la causa si cancela y la explicación", async () => {
    const usuario = userEvent.setup()
    render(<Ficha />)
    await usuario.click(screen.getByRole("button", { name: "Resolver" }))
    const dialogo = screen.getByRole("dialog", { name: "Resolver la disputa" })
    const resolver = within(dialogo).getByRole("button", { name: "Resolver" })

    await usuario.click(resolver)
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Elige qué pasa con la asignación."
    )

    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Cancelar la asignación" })
    )
    await usuario.type(
      within(dialogo).getByLabelText("Explicación de la decisión"),
      "Las métricas reportadas no corresponden a la publicación."
    )
    await usuario.click(resolver)
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Elige la causa de la cancelación."
    )
    expect(acciones.resolverDisputa).not.toHaveBeenCalled()

    await usuario.click(within(dialogo).getByRole("radio", { name: "Fraude" }))
    await usuario.click(resolver)
    await waitFor(() =>
      expect(acciones.resolverDisputa).toHaveBeenCalledWith({
        disputaId: DISPUTA,
        estadoResultante: "CANCELADA",
        causa: "FRAUDE",
        permanenciaVerificada: false,
        motivo: "Las métricas reportadas no corresponden a la publicación.",
      })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(
      screen.getByRole("region", { name: "Estado: ABIERTA" })
    ).toHaveFocus()
  })

  it("resolver: tocar fuera no borra la decisión y el pie dice «Volver» (U5)", async () => {
    const usuario = userEvent.setup()
    render(<Ficha />)
    await usuario.click(screen.getByRole("button", { name: "Resolver" }))
    const dialogo = screen.getByRole("dialog", { name: "Resolver la disputa" })
    const cancelar = within(dialogo).getByRole("radio", {
      name: "Cancelar la asignación",
    })
    await usuario.click(cancelar)
    const explicacion = within(dialogo).getByLabelText(
      "Explicación de la decisión"
    )
    await usuario.type(
      explicacion,
      "El medio no publicó el contenido aprobado."
    )

    const fondo = document.querySelector<HTMLElement>(
      '[data-slot="dialog-overlay"]'
    )
    expect(fondo).not.toBeNull()
    await usuario.click(fondo ?? document.body)
    expect(dialogo).toBeInTheDocument()
    expect(cancelar).toBeChecked()
    expect(explicacion).toHaveValue(
      "El medio no publicó el contenido aprobado."
    )

    // «Cancelar» se confundiría con «Cancelar la asignación».
    expect(
      within(dialogo).queryByRole("button", { name: "Cancelar" })
    ).not.toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole("button", { name: "Volver" }))
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(acciones.resolverDisputa).not.toHaveBeenCalled()
  })

  it("si al resolver el panel desaparece (disputa cerrada), el foco igual va al estado", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="EN_REVISION" />)
    await usuario.click(screen.getByRole("button", { name: "Descartar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Descartar la disputa?",
    })
    // La acción refresca la página: llega cerrada mientras el diálogo sigue abierto.
    acciones.descartarDisputa.mockImplementation(async () => {
      rerender(<Ficha estado="DESCARTADA" />)
      return exito()
    })
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Las pruebas no muestran un incumplimiento: la asignación sigue como estaba.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar" })
    )
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Estado: DESCARTADA" })
      ).toHaveFocus()
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("una opción bloqueada no se elige y dice por qué", async () => {
    const usuario = userEvent.setup()
    render(
      <Ficha
        resolucion={contexto({
          estadoPrevio: "VENCIDA_SIN_PUBLICAR",
          ofertaCerrada: true,
        })}
      />
    )
    await usuario.click(screen.getByRole("button", { name: "Resolver" }))
    const reabrir = screen.getByRole("radio", {
      name: "Reabrir la publicación",
    })
    expect(reabrir).toHaveAttribute("aria-disabled", "true")
    expect(reabrir).toHaveAccessibleDescription(/La oferta ya cerró/)
  })

  it("la constancia de permanencia se marca para verificar antes de tiempo", async () => {
    const usuario = userEvent.setup()
    render(
      <Ficha
        resolucion={contexto({
          puedeConstanciaManual: true,
          verificacion: { ...LIBRE, permanenciaHasta: "2026-10-28T15:00:00Z" },
        })}
      />
    )
    await usuario.click(screen.getByRole("button", { name: "Resolver" }))
    const dialogo = screen.getByRole("dialog", { name: "Resolver la disputa" })
    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Verificar la asignación" })
    )
    await usuario.type(
      within(dialogo).getByLabelText("Explicación de la decisión"),
      "Las cifras coinciden y el post sigue en línea."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Resolver" })
    )
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      /Marca la constancia/
    )
    await usuario.click(
      within(dialogo).getByRole("checkbox", { name: /dejo constancia/ })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Resolver" })
    )
    await waitFor(() =>
      expect(acciones.resolverDisputa).toHaveBeenCalledWith(
        expect.objectContaining({
          estadoResultante: "VERIFICADA",
          permanenciaVerificada: true,
        })
      )
    )
  })

  it("un rechazo de la BD queda dentro del diálogo", async () => {
    acciones.resolverDisputa.mockResolvedValue(
      fallo(
        "La oferta ya cerró: no se puede reabrir la publicación. Mantén el vencimiento o cancela la asignación."
      )
    )
    const usuario = userEvent.setup()
    render(
      <Ficha resolucion={contexto({ estadoPrevio: "VENCIDA_SIN_PUBLICAR" })} />
    )
    await usuario.click(screen.getByRole("button", { name: "Resolver" }))
    const dialogo = screen.getByRole("dialog", { name: "Resolver la disputa" })
    await usuario.click(
      within(dialogo).getByRole("radio", { name: "Reabrir la publicación" })
    )
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: /El medio demostró que publicó a tiempo/,
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Resolver" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "La oferta ya cerró"
    )
    expect(dialogo).toBeVisible()
  })

  it("descartar pide el motivo", async () => {
    const usuario = userEvent.setup()
    render(<Ficha estado="EN_REVISION" />)
    await usuario.click(screen.getByRole("button", { name: "Descartar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Descartar la disputa?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Las partes ya lo aclararon en la conversación.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar" })
    )
    await waitFor(() =>
      expect(acciones.descartarDisputa).toHaveBeenCalledWith({
        disputaId: DISPUTA,
        motivo: "Las partes ya lo aclararon en la conversación.",
      })
    )
  })

  it("sin estado previo de la asignación, resolver está bloqueado y explicado", () => {
    render(<Ficha resolucion={contexto({ estadoPrevio: null })} />)
    const resolver = screen.getByRole("button", { name: "Resolver" })
    expect(resolver).toBeDisabled()
    expect(resolver).toHaveAccessibleDescription(
      /No sabemos de qué estado venía la asignación/
    )
  })
})
