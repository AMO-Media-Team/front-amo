import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type {
  CanalNotificacion,
  PermisosConfiguracion,
  Plantilla,
} from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
vi.mock("../actions", () => ({
  guardarPlantilla: vi.fn(),
  historialCambios: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ProveedorConfiguracion } from "./contexto-configuracion"
import { PlantillasNotificacion } from "./plantillas-notificacion"

const SOLO_LECTURA: PermisosConfiguracion = {
  editar: false,
  comisiones: false,
  tarifas: false,
  tributario: false,
  catalogos: false,
  verAuditoria: false,
  datosSensibles: false,
}

function plantilla(
  clave: string,
  nombre: string,
  canal: CanalNotificacion
): Plantilla {
  return {
    clave,
    canal,
    nombre,
    asunto: canal === "EMAIL" ? nombre : null,
    cuerpo: "Hola {{nombre}}",
    variables: ["nombre"],
    activa: true,
    actualizadoAt: "2026-10-01T12:00:00+00:00",
  }
}

const PLANTILLAS = [
  plantilla("oferta.publicada", "Oferta publicada", "APP"),
  plantilla("titular.solicitud_radicada", "Solicitud radicada", "APP"),
  plantilla("oferta.publicada", "Oferta publicada (correo)", "EMAIL"),
  plantilla("usuario.invitado", "Invitación a AMO", "EMAIL"),
  plantilla("cola.solicitud_titular", "Solicitud para el equipo", "EMAIL"),
]

function renderizar(correoHabilitado: boolean) {
  render(
    <ProveedorConfiguracion permisos={SOLO_LECTURA}>
      <PlantillasNotificacion
        plantillas={PLANTILLAS}
        correoHabilitado={correoHabilitado}
      />
    </ProveedorConfiguracion>
  )
}

const nombres = () =>
  screen
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("button").textContent ?? "")

describe("PlantillasNotificacion · filtro por canal", () => {
  it("abre en «Aplicación» y cambia a «Correo» con sus conteos", async () => {
    const usuario = userEvent.setup()
    renderizar(true)

    const canal = screen.getByRole("group", { name: "Canal" })
    const app = within(canal).getByRole("button", { name: /Aplicación/ })
    const correo = within(canal).getByRole("button", { name: /Correo/ })
    expect(app).toHaveAttribute("aria-pressed", "true")
    expect(app).toHaveAccessibleName("Aplicación 2 plantillas")
    expect(correo).toHaveAccessibleName("Correo 3 plantillas")
    expect(nombres()).toHaveLength(2)
    expect(screen.getByText("Datos personales")).toBeInTheDocument()

    await usuario.click(correo)
    expect(correo).toHaveAttribute("aria-pressed", "true")
    expect(nombres()).toHaveLength(3)
    expect(screen.getByText("Colas del equipo AMO")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 plantillas de correo"
    )
    // Encendido, no hay aviso de correo apagado.
    expect(
      screen.queryByText("El envío por correo está apagado.")
    ).not.toBeInTheDocument()

    // Tocar el canal activo no lo desmarca.
    await usuario.click(correo)
    expect(correo).toHaveAttribute("aria-pressed", "true")
  })

  it("con el correo apagado, la vista de correo lo advierte", async () => {
    const usuario = userEvent.setup()
    renderizar(false)
    expect(
      screen.queryByText("El envío por correo está apagado.")
    ).not.toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: /Correo/ }))
    expect(
      screen.getByText("El envío por correo está apagado.")
    ).toBeInTheDocument()
  })

  it("la búsqueda se aplica dentro del canal elegido", async () => {
    const usuario = userEvent.setup()
    renderizar(true)
    await usuario.type(
      screen.getByRole("textbox", { name: "Buscar plantillas" }),
      "invitacion"
    )
    expect(
      screen.getByText(
        "Ninguna plantilla de aplicación coincide con «invitacion»."
      )
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: /Correo/ }))
    expect(nombres()).toEqual([expect.stringContaining("Invitación a AMO")])
  })
})
