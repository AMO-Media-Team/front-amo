import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { SolicitudParaInvitar } from "../invitacion"
import type { CapacidadesCola } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  invitarSolicitud: vi.fn(),
  descartarSolicitud: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const territorio = vi.hoisted(() => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => territorio)
const avisos = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: avisos }))

import { AccionesSolicitud } from "./acciones-solicitud"
import { ProveedorColaSolicitudes } from "./proveedor-cola"

const ROL_MEDIO = "0199f3a0-0000-7000-8000-0000000000aa"
const MEDIO_NUEVO_ID = "0199f3a0-0000-7000-8000-000000000020"

const SOLICITUD: SolicitudParaInvitar = {
  id: "0199f3a0-0000-7000-8000-000000000001",
  nombreMedio: "Noticias Pasto",
  tipo: "PAGINA_NOTICIAS",
  municipioCodigo: "52001",
  ubicacion: "Pasto, Nariño",
  contactoNombre: "Ana Pérez",
  email: "ana@noticiaspasto.co",
  celular: "300 123 4567",
  coincidencias: [],
}

const TODO: CapacidadesCola = {
  invitar: true,
  registrarMedio: true,
  motivoSinInvitar: null,
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.clearAllMocks()
  territorio.listarDepartamentosActivos.mockResolvedValue(
    exito([
      {
        codigo: "52",
        nombre: "Nariño",
        nombreCorto: "Nariño",
        region: "Pacífica",
      },
    ])
  )
  territorio.listarMunicipiosActivos.mockResolvedValue(
    exito([
      {
        codigo: "52001",
        nombre: "Pasto",
        departamentoCodigo: "52",
        esCapital: true,
      },
    ])
  )
})

function pintar(
  capacidades: CapacidadesCola = TODO,
  solicitud: SolicitudParaInvitar = SOLICITUD
) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cliente}>
      <ProveedorColaSolicitudes
        idResumen="resumen-cola"
        datos={{
          capacidades,
          roles: [{ id: ROL_MEDIO, nombre: "Medio" }],
          smtpConfigurado: false,
        }}
      >
        <p id="resumen-cola" tabIndex={-1}>
          1 solicitud por atender
        </p>
        <AccionesSolicitud solicitud={solicitud} />
      </ProveedorColaSolicitudes>
    </QueryClientProvider>
  )
}

describe("AccionesSolicitud · Invitar", () => {
  it("abre la hoja lista para confirmar y muestra UNA vez el enlace", async () => {
    const usuario = userEvent.setup()
    acciones.invitarSolicitud.mockResolvedValue(
      exito({
        medio: { id: MEDIO_NUEVO_ID, nombre: "Noticias Pasto" },
        email: "ana@noticiaspasto.co",
        credencial: {
          tipo: "ENLACE",
          enlace: "https://amo.test/auth/confirm?token=uno",
          proposito: "invitacion",
        },
        advertencia: null,
      })
    )
    pintar()

    await usuario.click(
      screen.getByRole("button", { name: "Invitar a Noticias Pasto" })
    )
    const hoja = await screen.findByRole("dialog", {
      name: "Invitar a Noticias Pasto",
    })
    expect(within(hoja).getByLabelText("Nombre del medio")).toHaveValue(
      "Noticias Pasto"
    )
    expect(within(hoja).getByLabelText("Correo electrónico")).toHaveValue(
      "ana@noticiaspasto.co"
    )
    expect(hoja).toHaveTextContent("Entrará con el rol «Medio».")

    await usuario.click(within(hoja).getByRole("button", { name: "Invitar" }))

    expect(acciones.invitarSolicitud).toHaveBeenCalledWith({
      solicitudId: SOLICITUD.id,
      medioExistenteId: "",
      nombreMedio: "Noticias Pasto",
      tipo: "PAGINA_NOTICIAS",
      municipioCodigo: "52001",
      contactoNombre: "Ana Pérez",
      email: "ana@noticiaspasto.co",
      celular: "300 123 4567",
      rolId: ROL_MEDIO,
      metodo: "ENLACE",
    })
    const credencial = await screen.findByRole("dialog", {
      name: "Comparte el enlace de invitación",
    })
    expect(within(credencial).getByRole("textbox")).toHaveValue(
      "https://amo.test/auth/confirm?token=uno"
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Solicitud atendida",
      expect.objectContaining({
        description:
          "Registramos «Noticias Pasto» e invitamos a ana@noticiaspasto.co.",
      })
    )

    await usuario.click(
      within(credencial).getByRole("button", { name: "Ya lo compartí" })
    )
    await waitFor(() =>
      expect(document.getElementById("resumen-cola")).toHaveFocus()
    )
  })

  it("si el medio quedó registrado y la cuenta falló, el reintento usa ese medio", async () => {
    const usuario = userEvent.setup()
    acciones.invitarSolicitud.mockResolvedValueOnce({
      ...fallo(
        "Registramos el medio «Noticias Pasto», pero no pudimos crear la cuenta: ese correo ya tiene una cuenta.",
        {
          email: ["Ese correo ya tiene una cuenta."],
        }
      ),
      medioRegistrado: { id: MEDIO_NUEVO_ID, nombre: "Noticias Pasto" },
    })
    pintar()

    await usuario.click(
      screen.getByRole("button", { name: "Invitar a Noticias Pasto" })
    )
    const hoja = await screen.findByRole("dialog", {
      name: "Invitar a Noticias Pasto",
    })
    await usuario.click(within(hoja).getByRole("button", { name: "Invitar" }))

    expect(
      await within(hoja).findByText("Ese correo ya tiene una cuenta.")
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(within(hoja).getByLabelText("Correo electrónico")).toHaveFocus()
    )
    // Ya no se ofrece registrar otro: queda elegido el recién registrado.
    expect(within(hoja).queryByLabelText("Nombre del medio")).toBeNull()
    expect(hoja).toHaveTextContent(
      "Se vinculará a «Noticias Pasto» (Registrado hace un momento con esta solicitud)."
    )

    acciones.invitarSolicitud.mockResolvedValueOnce(
      exito({
        medio: { id: MEDIO_NUEVO_ID, nombre: "Noticias Pasto" },
        email: "contacto@noticiaspasto.co",
        credencial: { tipo: "CORREO" },
        advertencia: null,
      })
    )
    const correo = within(hoja).getByLabelText("Correo electrónico")
    await usuario.clear(correo)
    await usuario.type(correo, "contacto@noticiaspasto.co")
    await usuario.click(within(hoja).getByRole("button", { name: "Invitar" }))

    expect(acciones.invitarSolicitud).toHaveBeenLastCalledWith(
      expect.objectContaining({
        medioExistenteId: MEDIO_NUEVO_ID,
        email: "contacto@noticiaspasto.co",
      })
    )
    expect(
      await screen.findByRole("dialog", { name: "Invitación enviada" })
    ).toBeInTheDocument()
    // El medio ya estaba registrado: el aviso no dice que se registró ahora.
    expect(avisos.success).toHaveBeenLastCalledWith(
      "Solicitud atendida",
      expect.objectContaining({
        description:
          "Invitamos a contacto@noticiaspasto.co a «Noticias Pasto».",
      })
    )
  })

  it("sin permiso explica por qué no puede invitar", () => {
    pintar({
      invitar: false,
      registrarMedio: true,
      motivoSinInvitar:
        "Para invitar necesitas el permiso «Invitar usuarios». Pide a un administrador que la atienda.",
    })
    const boton = screen.getByRole("button", {
      name: "Invitar a Noticias Pasto",
    })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAccessibleDescription(
      "Para invitar necesitas el permiso «Invitar usuarios». Pide a un administrador que la atienda."
    )
  })
})

describe("AccionesSolicitud · Descartar", () => {
  it("exige un motivo y lo envía", async () => {
    const usuario = userEvent.setup()
    acciones.descartarSolicitud.mockResolvedValue(exito())
    pintar()

    await usuario.click(
      screen.getByRole("button", {
        name: "Descartar la solicitud de Noticias Pasto",
      })
    )
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Descartar la solicitud de Noticias Pasto?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar" })
    )
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(
      "Describe el motivo"
    )
    expect(acciones.descartarSolicitud).not.toHaveBeenCalled()

    await usuario.type(
      within(dialogo).getByLabelText("Motivo"),
      "Cuenta personal, no es un medio."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar" })
    )

    expect(acciones.descartarSolicitud).toHaveBeenCalledWith({
      solicitudId: SOLICITUD.id,
      motivo: "Cuenta personal, no es un medio.",
    })
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Solicitud descartada",
      expect.anything()
    )
  })

  it("un fallo se muestra dentro del diálogo y lo deja abierto", async () => {
    const usuario = userEvent.setup()
    acciones.descartarSolicitud.mockResolvedValue(
      fallo("La solicitud ya fue atendida. Actualiza la página.")
    )
    pintar()

    await usuario.click(
      screen.getByRole("button", {
        name: "Descartar la solicitud de Noticias Pasto",
      })
    )
    const dialogo = await screen.findByRole("alertdialog")
    await usuario.type(
      within(dialogo).getByLabelText("Motivo"),
      "Duplicada con otra solicitud."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Descartar" })
    )

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "La solicitud ya fue atendida."
    )
    expect(avisos.success).not.toHaveBeenCalled()
  })
})
