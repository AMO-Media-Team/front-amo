import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { SolicitudPropia } from "../tipos"

const acciones = vi.hoisted(() => ({
  radicarSolicitud: vi.fn(),
  aportarInformacion: vi.fn(),
  desistirSolicitud: vi.fn(),
  firmarSoportePropio: vi.fn(),
  firmarSoporteInterno: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { MisSolicitudes } from "./mis-solicitudes"

function solicitud(cambios: Partial<SolicitudPropia> = {}): SolicitudPropia {
  return {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
    numero: 41,
    tipo: "RECTIFICACION",
    estado: "RADICADA",
    descripcion: "Mi celular quedó con un número equivocado.",
    datosAfectados: ["CONTACTO"],
    recibidaAt: "2026-10-20T15:00:00Z",
    plazoVence: "2026-11-11",
    alertaDesde: "2026-11-09",
    enTramiteAt: null,
    requerimiento: null,
    requeridaAt: null,
    informacionAportada: null,
    informacionAt: null,
    prorrogaMotivo: null,
    prorrogadaAt: null,
    decision: null,
    respuesta: null,
    respondidaAt: null,
    tieneSoporte: false,
    desistidaAt: null,
    supresionEjecutadaAt: null,
    ...cambios,
  }
}

beforeEach(() => {
  for (const accion of Object.values(acciones)) {
    accion.mockReset().mockResolvedValue(exito())
  }
})

describe("MisSolicitudes", () => {
  it("sin solicitudes lo explica", () => {
    render(<MisSolicitudes solicitudes={[]} resaltada={null} />)
    expect(screen.getByText(/Aún no has hecho solicitudes/)).toBeInTheDocument()
  })

  it("muestra el radicado, el estado en voz del titular y la fecha límite", () => {
    render(<MisSolicitudes solicitudes={[solicitud()]} resaltada={null} />)
    const tarjeta = screen.getByRole("article", {
      name: "Rectificación de datos",
    })
    expect(tarjeta).toHaveTextContent("N.º 41")
    expect(tarjeta).toHaveTextContent("Recibida")
    expect(tarjeta).toHaveTextContent("11 de noviembre de 2026")
    expect(tarjeta).toHaveTextContent("Datos: Contacto")
    expect(
      within(tarjeta).getByRole("button", { name: /Desistir/ })
    ).toBeInTheDocument()
  })

  it("con un requerimiento ofrece «Responder» y envía la información", async () => {
    const usuario = userEvent.setup()
    render(
      <MisSolicitudes
        solicitudes={[
          solicitud({
            estado: "REQUIERE_INFORMACION",
            requerimiento: "Indícanos el número correcto.",
            requeridaAt: "2026-10-21T15:00:00Z",
          }),
        ]}
        resaltada={null}
      />
    )
    expect(screen.getByText("Te pedimos información")).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", {
        name: "Responder el requerimiento de la solicitud N.º 41",
      })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Tu respuesta"),
      "Es el 300 123 4567."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Enviar respuesta" })
    )
    expect(acciones.aportarInformacion).toHaveBeenCalledWith({
      solicitudId: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
      informacion: "Es el 300 123 4567.",
    })
  })

  it("una respondida muestra la decisión, la respuesta y el soporte, sin desistir", () => {
    render(
      <MisSolicitudes
        solicitudes={[
          solicitud({
            estado: "RESPONDIDA",
            decision: "PROCEDE",
            respuesta: "Corregimos tu celular en tu perfil.",
            respondidaAt: "2026-10-22T15:00:00Z",
            tieneSoporte: true,
          }),
        ]}
        resaltada={null}
      />
    )
    expect(screen.getByText("Atendimos tu solicitud.")).toBeInTheDocument()
    expect(
      screen.getByText("Corregimos tu celular en tu perfil.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "Descargar el soporte de la respuesta a la solicitud N.º 41",
      })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Desistir/ })).toBeNull()
  })

  it("con `?solicitud=` la resalta y le da el foco", () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(
      <MisSolicitudes
        solicitudes={[
          solicitud(),
          solicitud({
            id: "0192f3a4-5b6c-7d8e-9f01-0000000000a2",
            numero: 42,
            tipo: "CONSULTA",
          }),
        ]}
        resaltada="0192f3a4-5b6c-7d8e-9f01-0000000000a2"
      />
    )
    expect(
      screen.getByRole("article", { name: "Consulta de datos" })
    ).toHaveFocus()
  })
})
