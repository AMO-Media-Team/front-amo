import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { ModoGestion } from "@/features/campanas/rutas-gestion"

import { accionesGestion } from "../acciones"
import { situacionOferta } from "../presentacion"
import type { FechasOferta } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  enviarOfertaARevision: vi.fn(),
  retirarOfertaDeRevision: vi.fn(),
  cancelarOferta: vi.fn(),
  archivarOferta: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
const enrutador = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))

import { AccionesOferta } from "./acciones-oferta"
import { AvisoEstadoOferta } from "./aviso-estado-oferta"

const OFERTA = "0192f3a4-5b6c-7d8e-9f01-0000000000f1"
const CAMPANA = "0192f3a4-5b6c-7d8e-9f01-0000000000c1"
const PROPIAS = ["ofertas.gestionar_propias"]
const OPERACIONES = ["ofertas.gestionar", "ofertas.moderar", "ofertas.ver"]
const ASISTIDO: ModoGestion = {
  modo: "asistido",
  anuncianteId: "e2e00000-0000-4000-8000-00000000a001",
  anunciante: "Café Sierra Alta",
}

type EstadoOferta = Parameters<typeof accionesGestion>[0]

function accionesAnunciante(
  estado: EstadoOferta,
  permisos: readonly string[],
  situacion: { cuposOcupados: number }
) {
  return accionesGestion(estado, "ANUNCIANTE", permisos, situacion)
}

function renderizar(estado: EstadoOferta, cuposOcupados = 0) {
  const usuario = userEvent.setup()
  render(
    <AccionesOferta
      ofertaId={OFERTA}
      campanaId={CAMPANA}
      titulo="Reel de Halloween"
      estado={estado}
      opciones={accionesAnunciante(estado, PROPIAS, { cuposOcupados })}
    />
  )
  return usuario
}

/** El panel de gestión asistida de la ficha interna (ADM-014). */
function renderizarAsistido(estado: EstadoOferta) {
  const usuario = userEvent.setup()
  render(
    <AccionesOferta
      ofertaId={OFERTA}
      campanaId={CAMPANA}
      titulo="Reel de Halloween"
      estado={estado}
      opciones={accionesGestion(estado, "ADMIN", OPERACIONES, {
        cuposOcupados: 0,
      })}
      gestion={ASISTIDO}
      disposicion="columna"
    />
  )
  return usuario
}

const FECHAS: FechasOferta = {
  creadaAt: "2026-10-20T15:00:00.000Z",
  enviadaAt: "2026-10-21T15:00:00.000Z",
  devueltaAt: null,
  publicadaAt: null,
  cuposCompletosAt: null,
  enEjecucionAt: null,
  vencidaAt: null,
  cerradaAt: null,
  canceladaAt: null,
}

/** La cabecera de la ficha: el aviso del estado y las acciones que admite. */
function Cabecera({ estado }: { estado: EstadoOferta }) {
  return (
    <>
      <AvisoEstadoOferta
        estado={estado}
        situacion={situacionOferta(
          {
            estado,
            fechas: FECHAS,
            fechaLimiteAceptacion: "2026-10-30T22:00:00.000Z",
            ventanaInicio: "2026-11-01T05:00:00.000Z",
            ventanaFin: "2026-11-10T05:00:00.000Z",
            comentarioModeracion: null,
            ultimoCambio: null,
          },
          "anunciante"
        )}
      />
      <AccionesOferta
        ofertaId={OFERTA}
        campanaId={CAMPANA}
        titulo="Reel de Halloween"
        estado={estado}
        opciones={accionesAnunciante(estado, PROPIAS, { cuposOcupados: 0 })}
      />
    </>
  )
}

beforeEach(() => {
  acciones.enviarOfertaARevision.mockReset().mockResolvedValue(exito())
  acciones.retirarOfertaDeRevision.mockReset().mockResolvedValue(exito())
  acciones.cancelarOferta.mockReset().mockResolvedValue(exito())
  acciones.archivarOferta.mockReset().mockResolvedValue(exito())
  enrutador.replace.mockReset()
  avisos.success.mockReset()
})

describe("AccionesOferta", () => {
  it("un borrador se edita en el asistente y se envía a revisión", async () => {
    const usuario = renderizar("BORRADOR")
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/campanas/${CAMPANA}/ofertas/${OFERTA}/editar`
    )

    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Enviar la oferta a revisión?",
    })
    expect(
      within(dialogo).getByText(/etiqueta de publicidad es obligatoria/)
    ).toBeInTheDocument()
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a revisión" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(acciones.enviarOfertaARevision).toHaveBeenCalledWith({
      ofertaId: OFERTA,
    })
  })

  it("si falta un paso, lo nombra y enlaza a ese paso del asistente", async () => {
    acciones.enviarOfertaARevision.mockResolvedValue({
      ...fallo("Carga el paquete creativo con al menos un archivo."),
      paso: "creativo",
    })
    const usuario = renderizar("DEVUELTA")
    await usuario.click(
      screen.getByRole("button", { name: "Reenviar a revisión" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Reenviar la oferta a revisión?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reenviar a revisión" })
    )

    const aviso = await within(dialogo).findByRole("alert")
    expect(aviso).toHaveTextContent("Falta completar: Paquete creativo")
    expect(aviso).toHaveTextContent(
      "Carga el paquete creativo con al menos un archivo."
    )
    expect(
      within(aviso).getByRole("link", { name: /Ir a «Paquete creativo»/ })
    ).toHaveAttribute(
      "href",
      `/campanas/${CAMPANA}/ofertas/${OFERTA}/editar?paso=creativo`
    )
    // El diálogo sigue abierto para reintentar.
    expect(dialogo).toBeInTheDocument()
  })

  it("un fallo sin paso (empresa sin verificar) solo muestra el detalle", async () => {
    acciones.enviarOfertaARevision.mockResolvedValue({
      ...fallo(
        "La empresa debe estar verificada por AMO para enviar ofertas a revisión."
      ),
      paso: "envio",
    })
    const usuario = renderizar("BORRADOR")
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a revisión" })
    )
    const aviso = await within(dialogo).findByRole("alert")
    expect(aviso).toHaveTextContent("No se pudo enviar a revisión")
    expect(within(aviso).queryByRole("link")).not.toBeInTheDocument()
  })

  it("en revisión solo se retira, con confirmación", async () => {
    const usuario = renderizar("EN_REVISION")
    expect(screen.getAllByRole("button")).toHaveLength(1)
    await usuario.click(
      screen.getByRole("button", { name: "Retirar de revisión" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Retirar la oferta de revisión?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Retirar de revisión" })
    )
    await waitFor(() =>
      expect(acciones.retirarOfertaDeRevision).toHaveBeenCalledWith({
        ofertaId: OFERTA,
      })
    )
  })

  it("cancelar una publicada pide motivo y ofrece los frecuentes", async () => {
    const usuario = renderizar("PUBLICADA")
    await usuario.click(screen.getByRole("button", { name: "Cancelar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Cancelar la oferta publicada?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Sí, cancelar la oferta" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      /Describe el motivo/
    )
    expect(acciones.cancelarOferta).not.toHaveBeenCalled()

    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "La campaña cambió de estrategia.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Sí, cancelar la oferta" })
    )
    await waitFor(() =>
      expect(acciones.cancelarOferta).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        motivo: "La campaña cambió de estrategia.",
      })
    )
  })

  it("una publicada con cupos tomados explica que no se puede cancelar", async () => {
    const usuario = renderizar("PUBLICADA", 2)
    await usuario.click(screen.getByRole("button", { name: "Cancelar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "No se puede cancelar la oferta",
    })
    expect(dialogo).toHaveTextContent(/ya generó obligaciones/)
    expect(dialogo).toHaveTextContent(/2 medios aceptaron cupos/)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Entendido" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(acciones.cancelarOferta).not.toHaveBeenCalled()
  })

  it("cancelar un borrador solo confirma y muestra el fallo de la BD", async () => {
    acciones.cancelarOferta.mockResolvedValue(
      fallo("Este cambio ya no es posible en el estado actual.")
    )
    const usuario = renderizar("BORRADOR")
    await usuario.click(screen.getByRole("button", { name: "Cancelar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Cancelar la oferta?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar oferta" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Este cambio ya no es posible en el estado actual."
    )
    expect(acciones.cancelarOferta).toHaveBeenCalledWith({ ofertaId: OFERTA })
  })

  it("una cancelada se archiva tras confirmar y se vuelve a la campaña", async () => {
    const usuario = renderizar("CANCELADA")
    expect(screen.getAllByRole("button")).toHaveLength(1)
    await usuario.click(screen.getByRole("button", { name: "Archivar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Archivar la oferta?",
    })
    expect(dialogo).toHaveAccessibleDescription(
      /el equipo AMO conserva su historial/
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Archivar oferta" })
    )
    await waitFor(() =>
      expect(enrutador.replace).toHaveBeenCalledWith(
        `/campanas/${CAMPANA}?pestana=ofertas`
      )
    )
    expect(acciones.archivarOferta).toHaveBeenCalledWith({ ofertaId: OFERTA })
  })

  it("si la BD no la archiva, el porqué queda en el diálogo y no se sale", async () => {
    acciones.archivarOferta.mockResolvedValue(
      fallo("Solo se archivan borradores y ofertas terminadas.")
    )
    const usuario = renderizar("CERRADA")
    await usuario.click(screen.getByRole("button", { name: "Archivar oferta" }))
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Archivar oferta" })
    )
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "Solo se archivan borradores y ofertas terminadas."
    )
    expect(enrutador.replace).not.toHaveBeenCalled()
  })

  it("una vencida se archiva con confirmación (nunca tiene cupos tomados)", async () => {
    const usuario = renderizar("VENCIDA", 2)
    await usuario.click(screen.getByRole("button", { name: "Archivar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Archivar la oferta?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Archivar oferta" })
    )
    await waitFor(() =>
      expect(acciones.archivarOferta).toHaveBeenCalledWith({ ofertaId: OFERTA })
    )
  })

  it("tras retirarla, el foco va al aviso del estado aunque el botón desaparezca", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Cabecera estado="EN_REVISION" />)
    await usuario.click(
      screen.getByRole("button", { name: "Retirar de revisión" })
    )
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Retirar de revisión" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    // El repintado de la ficha: ya en borrador, «Retirar» no existe.
    rerender(<Cabecera estado="BORRADOR" />)
    expect(
      screen.queryByRole("button", { name: "Retirar de revisión" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Borrador" })).toHaveFocus()
  })

  it("tras enviarla a revisión, el foco va al aviso del estado", async () => {
    const usuario = userEvent.setup()
    const { rerender } = render(<Cabecera estado="BORRADOR" />)
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a revisión" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    rerender(<Cabecera estado="EN_REVISION" />)
    expect(screen.getByRole("region", { name: "En revisión" })).toHaveFocus()
  })

  it("si se cierra sin cambiar nada, el foco vuelve al botón", async () => {
    const usuario = userEvent.setup()
    render(<Cabecera estado="BORRADOR" />)
    const cancelar = screen.getByRole("button", { name: "Cancelar oferta" })
    await usuario.click(cancelar)
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(within(dialogo).getByRole("button", { name: "Volver" }))
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(cancelar).toHaveFocus()
    expect(acciones.cancelarOferta).not.toHaveBeenCalled()
  })

  it("con un fallo el diálogo sigue abierto y, al cerrarlo, el foco vuelve al botón", async () => {
    acciones.cancelarOferta.mockResolvedValue(
      fallo("Este cambio ya no es posible en el estado actual.")
    )
    const usuario = userEvent.setup()
    render(<Cabecera estado="BORRADOR" />)
    const cancelar = screen.getByRole("button", { name: "Cancelar oferta" })
    await usuario.click(cancelar)
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Cancelar oferta" })
    )
    await within(dialogo).findByRole("alert")
    await usuario.keyboard("{Escape}")
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(cancelar).toHaveFocus()
  })

  it("sin acciones no pinta nada", () => {
    const { container } = render(
      <AccionesOferta
        ofertaId={OFERTA}
        campanaId={CAMPANA}
        titulo="Reel"
        estado="BORRADOR"
        opciones={[]}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe("AccionesOferta · gestión asistida (ADM-014)", () => {
  it("editar y el paso que falta llevan a las rutas de Operación", async () => {
    acciones.enviarOfertaARevision.mockResolvedValue({
      ...fallo("Carga el paquete creativo con al menos un archivo."),
      paso: "creativo",
    })
    const usuario = renderizarAsistido("BORRADOR")
    expect(screen.getByRole("link", { name: "Editar" })).toHaveAttribute(
      "href",
      `/operacion/ofertas/${OFERTA}/editar`
    )
    await usuario.click(
      screen.getByRole("button", { name: "Enviar a revisión" })
    )
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Enviar la oferta a revisión?",
    })
    expect(dialogo).toHaveTextContent(
      /Queda en la cola de moderación y Café Sierra Alta recibe un aviso/
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar a revisión" })
    )
    const aviso = await within(dialogo).findByRole("alert")
    expect(
      within(aviso).getByRole("link", { name: /Ir a «Paquete creativo»/ })
    ).toHaveAttribute(
      "href",
      `/operacion/ofertas/${OFERTA}/editar?paso=creativo`
    )
  })

  it("al enviar, el aviso dice que queda en la cola de moderación", async () => {
    const usuario = renderizarAsistido("DEVUELTA")
    await usuario.click(
      screen.getByRole("button", { name: "Reenviar a revisión" })
    )
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reenviar a revisión" })
    )
    await waitFor(() => expect(dialogo).not.toBeInTheDocument())
    expect(avisos.success).toHaveBeenCalledWith("Oferta reenviada a revisión", {
      description: "Queda en la cola de moderación.",
    })
  })

  it("cancelar un borrador pide motivo al equipo AMO y lo lleva a la acción", async () => {
    const usuario = renderizarAsistido("BORRADOR")
    await usuario.click(screen.getByRole("button", { name: "Cancelar oferta" }))
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Cancelar la oferta?",
    })
    expect(dialogo).toHaveTextContent(
      /Se descarta por cuenta de Café Sierra Alta, que recibe un aviso con el motivo/
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Lo solicitó la empresa." })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Sí, cancelar la oferta" })
    )
    await waitFor(() =>
      expect(acciones.cancelarOferta).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        motivo: "Lo solicitó la empresa.",
      })
    )
  })

  it("archivada, vuelve a la ficha interna de la campaña", async () => {
    const usuario = renderizarAsistido("CANCELADA")
    await usuario.click(screen.getByRole("button", { name: "Archivar oferta" }))
    const dialogo = screen.getByRole("alertdialog")
    expect(dialogo).toHaveTextContent(/también para Café Sierra Alta/)
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Archivar oferta" })
    )
    await waitFor(() =>
      expect(enrutador.replace).toHaveBeenCalledWith(
        `/operacion/campanas/${CAMPANA}`
      )
    )
  })
})
