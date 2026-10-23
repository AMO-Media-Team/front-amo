import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ID_AVISO_ESTADO_OFERTA } from "@/features/ofertas/foco"
import type { EstadoOferta } from "@/features/operacion/estados"
import { exito, fallo } from "@/lib/result"

import {
  BLOQUEO_FECHA_LIMITE,
  decisionesDisponibles,
  MENSAJE_OFERTA_REENVIADA,
} from "../decision"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  publicarOferta: vi.fn(),
  devolverOferta: vi.fn(),
  rechazarOferta: vi.fn(),
  cancelarOfertaPublicada: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { DecisionModeracion } from "./decision-moderacion"

const OFERTA = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"
const MODERADOR = ["ofertas.ver", "ofertas.moderar"]
/** El envío que muestra la ficha, como lo entrega PostgREST. */
const ENVIADA = "2026-10-21T15:04:05.123456+00:00"
const REENVIADA = "2026-10-21T15:09:41.654321+00:00"
const LIBRE = { fechaLimiteVencida: false, cuposOcupados: 0 }

/** La ficha: el aviso del estado (destino del foco) y el panel de decisión. */
function Ficha({
  estado,
  enviadaAt = ENVIADA,
  situacion = LIBRE,
}: {
  estado: EstadoOferta
  enviadaAt?: string | null
  situacion?: typeof LIBRE
}) {
  return (
    <>
      <section
        id={ID_AVISO_ESTADO_OFERTA}
        tabIndex={-1}
        aria-label={`Estado: ${estado}`}
      />
      <DecisionModeracion
        oferta={{ id: OFERTA, titulo: "Reel de Halloween", estado, enviadaAt }}
        opciones={decisionesDisponibles(estado, MODERADOR, situacion)}
      />
    </>
  )
}

function renderizar(estado: EstadoOferta, situacion = LIBRE) {
  const usuario = userEvent.setup()
  render(<Ficha estado={estado} situacion={situacion} />)
  return usuario
}

beforeEach(() => {
  for (const accion of Object.values(acciones)) {
    accion.mockReset().mockResolvedValue(exito())
  }
})

describe("DecisionModeracion", () => {
  it("en revisión ofrece qué comprobar y las tres decisiones", () => {
    renderizar("EN_REVISION")
    expect(
      screen.getByRole("heading", { name: "Qué comprobar" })
    ).toBeInTheDocument()
    for (const nombre of ["Publicar", "Devolver", "Rechazar"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeEnabled()
    }
    expect(
      screen.queryByRole("button", { name: "Cancelar oferta" })
    ).not.toBeInTheDocument()
  })

  it("publicar confirma y llama a la acción", async () => {
    const usuario = renderizar("EN_REVISION")
    await usuario.click(screen.getByRole("button", { name: "Publicar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Publicar la oferta?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Publicar" })
    )
    await waitFor(() =>
      expect(acciones.publicarOferta).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        enviadaAt: ENVIADA,
      })
    )
  })

  it("decide sobre el envío que mostraba la ficha al abrir el diálogo", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="EN_REVISION" />)
    await usuario.click(screen.getByRole("button", { name: "Publicar" }))
    const dialogo = screen.getByRole("alertdialog")
    // La ficha se refresca con un reenvío mientras el diálogo está abierto.
    rerender(<Ficha estado="EN_REVISION" enviadaAt={REENVIADA} />)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Publicar" })
    )
    await waitFor(() =>
      expect(acciones.publicarOferta).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        enviadaAt: ENVIADA,
      })
    )
  })

  it("si el anunciante la reenvió mientras se revisaba, el diálogo lo explica", async () => {
    acciones.publicarOferta.mockResolvedValue(fallo(MENSAJE_OFERTA_REENVIADA))
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="EN_REVISION" />)
    const publicar = screen.getByRole("button", { name: "Publicar" })
    await usuario.click(publicar)
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Publicar" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      MENSAJE_OFERTA_REENVIADA
    )
    // La acción ya refrescó la ficha; al volver a abrir se decide sobre lo nuevo.
    rerender(<Ficha estado="EN_REVISION" enviadaAt={REENVIADA} />)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(publicar).toHaveFocus()

    acciones.publicarOferta.mockResolvedValue(exito())
    await usuario.click(publicar)
    await usuario.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Publicar",
      })
    )
    await waitFor(() =>
      expect(acciones.publicarOferta).toHaveBeenLastCalledWith({
        ofertaId: OFERTA,
        enviadaAt: REENVIADA,
      })
    )
  })

  it("tras publicar, el foco va al aviso del estado", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="EN_REVISION" />)
    await usuario.click(screen.getByRole("button", { name: "Publicar" }))
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Publicar" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    // Publicada, el panel solo ofrece cancelar: «Publicar» ya no existe.
    rerender(<Ficha estado="PUBLICADA" />)
    expect(
      screen.queryByRole("button", { name: "Publicar" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Estado: PUBLICADA" })
    ).toHaveFocus()
  })

  it("con la fecha límite vencida, publicar está bloqueado y explicado", () => {
    renderizar("EN_REVISION", { fechaLimiteVencida: true, cuposOcupados: 0 })
    const publicar = screen.getByRole("button", { name: "Publicar" })
    expect(publicar).toBeDisabled()
    expect(publicar).toHaveAccessibleDescription(BLOQUEO_FECHA_LIMITE)
    expect(screen.getByRole("button", { name: "Devolver" })).toBeEnabled()
  })

  it("devolver exige un comentario; un motivo frecuente lo llena", async () => {
    const usuario = renderizar("EN_REVISION")
    await usuario.click(screen.getByRole("button", { name: "Devolver" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Devolver la oferta al anunciante?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Devolver" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      /Describe el motivo/
    )

    const sugerencia = within(dialogo).getByRole("button", {
      name: /El enlace de destino no es seguro/,
    })
    await usuario.click(sugerencia)
    expect(
      within(dialogo).getByLabelText("Comentario para el anunciante")
    ).toHaveValue(sugerencia.textContent)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Devolver" })
    )
    await waitFor(() =>
      expect(acciones.devolverOferta).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        enviadaAt: ENVIADA,
        motivo: sugerencia.textContent,
      })
    )
  })

  it("devuelta, el panel desaparece y el foco va al aviso del estado", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Ficha estado="EN_REVISION" />)
    await usuario.click(screen.getByRole("button", { name: "Devolver" }))
    const dialogo = screen.getByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Comentario para el anunciante"),
      "Ajusta el copy sugerido."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Devolver" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    rerender(<Ficha estado="DEVUELTA" />)
    expect(
      screen.queryByRole("heading", { name: "Decisión" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Estado: DEVUELTA" })
    ).toHaveFocus()
  })

  it("rechazar con motivo escrito; un fallo de la BD queda en el diálogo", async () => {
    acciones.rechazarOferta.mockResolvedValue(
      fallo(
        "La oferta ya no está «en revisión»: ahora está «publicada». Actualiza la página para ver su estado actual."
      )
    )
    const usuario = renderizar("EN_REVISION")
    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Rechazar la oferta?",
    })
    await usuario.type(
      within(dialogo).getByLabelText("Motivo del rechazo"),
      "Promociona apuestas no autorizadas."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      /ya no está «en revisión»/
    )
    expect(acciones.rechazarOferta).toHaveBeenCalledWith({
      ofertaId: OFERTA,
      enviadaAt: ENVIADA,
      motivo: "Promociona apuestas no autorizadas.",
    })
  })

  it("publicada: solo cancelar, bloqueado si ya tiene cupos tomados", () => {
    renderizar("PUBLICADA", { fechaLimiteVencida: false, cuposOcupados: 2 })
    const cancelar = screen.getByRole("button", { name: "Cancelar oferta" })
    expect(cancelar).toBeDisabled()
    expect(cancelar).toHaveAccessibleDescription(/hay 2 cupos tomados/)
    expect(
      screen.queryByRole("heading", { name: "Qué comprobar" })
    ).not.toBeInTheDocument()
  })

  it("cancelar una publicada sin cupos pide motivo", async () => {
    const usuario = renderizar("PUBLICADA")
    await usuario.click(screen.getByRole("button", { name: "Cancelar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Cancelar la oferta publicada?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "Lo solicitó el anunciante.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Sí, cancelar la oferta" })
    )
    await waitFor(() =>
      expect(acciones.cancelarOfertaPublicada).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        motivo: "Lo solicitó el anunciante.",
      })
    )
  })

  it("sin decisiones disponibles no pinta el panel", () => {
    const { container } = render(
      <DecisionModeracion
        oferta={{
          id: OFERTA,
          titulo: "Reel",
          estado: "CERRADA",
          enviadaAt: ENVIADA,
        }}
        opciones={[]}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
