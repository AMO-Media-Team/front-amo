import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { UsuarioSesion } from "@/lib/auth/tipos"

import type { DatosColaSolicitudes, SolicitudVinculacion } from "../tipos"

vi.mock("server-only", () => ({}))
const dal = vi.hoisted(() => ({
  requerirPermiso: vi.fn(),
  tieneAlgunPermiso: (
    usuario: { permisos: readonly string[] },
    permisos: readonly string[]
  ) => permisos.some((permiso) => usuario.permisos.includes(permiso)),
}))
vi.mock("@/lib/auth/dal", () => dal)
const consultas = vi.hoisted(() => ({
  colaSolicitudes: vi.fn(),
  LIMITE_PENDIENTES: 100,
}))
vi.mock("../queries", () => consultas)
vi.mock("../actions", () => ({
  invitarSolicitud: vi.fn(),
  descartarSolicitud: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }))

import { ColaSolicitudes } from "./cola-solicitudes"

const USUARIO = {
  id: "0199f3a0-0000-7000-8000-0000000000f0",
  permisos: ["medios.verificar", "medios.ver", "medios.editar"],
} as unknown as UsuarioSesion

const PENDIENTE: SolicitudVinculacion = {
  id: "0199f3a0-0000-7000-8000-000000000001",
  estado: "PENDIENTE",
  nombreMedio: "Noticias Pasto",
  tipo: null,
  contactoNombre: "Ana Pérez",
  email: "ana@noticiaspasto.co",
  celular: "3001234567",
  municipioCodigo: "52001",
  ubicacion: "Pasto, Nariño",
  cuentas: [
    { plataforma: "INSTAGRAM", usuario: "noticias.pasto", seguidores: 12_000 },
    { plataforma: "TIKTOK", usuario: "noticiaspasto", seguidores: null },
  ],
  mensaje: "Publicamos desde 2019.",
  recibidaAt: "2026-10-20T15:00:00.000Z",
  resolucion: null,
  coincidencias: [
    {
      id: "0199f3a0-0000-7000-8000-000000000010",
      nombre: "Noticias Pasto",
      estado: "VERIFICADO",
      municipioCodigo: "76001",
      municipio: "Cali, Valle",
      desdeSolicitud: false,
    },
  ],
}

const DESCARTADA: SolicitudVinculacion = {
  ...PENDIENTE,
  id: "0199f3a0-0000-7000-8000-000000000002",
  estado: "DESCARTADA",
  nombreMedio: "Página personal",
  coincidencias: [],
  resolucion: {
    at: "2026-10-21T15:00:00.000Z",
    por: "Laura Gómez",
    motivo: "Es una cuenta personal.",
    medio: null,
  },
}

function datos(
  cambios: Partial<DatosColaSolicitudes> = {}
): DatosColaSolicitudes {
  return {
    pendientes: [PENDIENTE],
    atendidas: [DESCARTADA],
    totalPendientes: 1,
    capacidades: {
      invitar: true,
      registrarMedio: true,
      motivoSinInvitar: null,
    },
    roles: [{ id: "0199f3a0-0000-7000-8000-0000000000aa", nombre: "Medio" }],
    smtpConfigurado: false,
    umbralSeguidores: 30_000,
    urlFormulario: "https://amo.test/vincular",
    ...cambios,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  dal.requerirPermiso.mockResolvedValue(USUARIO)
})

describe("ColaSolicitudes", () => {
  it("exige el permiso de verificar medios", async () => {
    consultas.colaSolicitudes.mockResolvedValue(datos())
    render(await ColaSolicitudes())
    expect(dal.requerirPermiso).toHaveBeenCalledWith("medios.verificar")
    expect(consultas.colaSolicitudes).toHaveBeenCalledWith(USUARIO)
  })

  it("muestra lo declarado, el contacto y el aviso de un medio con el mismo nombre", async () => {
    consultas.colaSolicitudes.mockResolvedValue(datos())
    render(await ColaSolicitudes())

    const tarjeta = screen.getByRole("article", { name: "Noticias Pasto" })
    expect(tarjeta).toHaveTextContent("Tipo sin indicar")
    expect(tarjeta).toHaveTextContent("Pasto, Nariño")
    expect(
      within(tarjeta).getByRole("link", { name: /^Instagram @noticias\.pasto/ })
    ).toHaveAttribute("href", "https://www.instagram.com/noticias.pasto/")
    expect(
      within(tarjeta).getByRole("link", { name: /^TikTok @noticiaspasto/ })
    ).toHaveAttribute("href", "https://www.tiktok.com/@noticiaspasto")
    expect(tarjeta).toHaveTextContent("Seguidores sin declarar")
    expect(tarjeta).toHaveTextContent(
      "Ninguna cuenta declarada llega a 30.000 seguidores."
    )
    expect(
      within(tarjeta).getByRole("link", { name: "ana@noticiaspasto.co" })
    ).toHaveAttribute("href", "mailto:ana@noticiaspasto.co")
    expect(
      within(tarjeta).getByRole("link", { name: /WhatsApp/ })
    ).toHaveAttribute("href", "https://wa.me/573001234567")
    expect(tarjeta).toHaveTextContent("Publicamos desde 2019.")
    expect(tarjeta).toHaveTextContent(
      "Ya hay un medio registrado con este nombre."
    )
    expect(
      within(tarjeta).getByRole("link", { name: "Noticias Pasto" })
    ).toHaveAttribute(
      "href",
      "/operacion/medios/0199f3a0-0000-7000-8000-000000000010"
    )
    expect(
      within(tarjeta).getByRole("button", { name: "Invitar a Noticias Pasto" })
    ).toBeEnabled()
  })

  it("sin permiso de ver medios, el medio con el mismo nombre no enlaza", async () => {
    dal.requerirPermiso.mockResolvedValue({
      ...USUARIO,
      permisos: ["medios.verificar"],
    })
    consultas.colaSolicitudes.mockResolvedValue(datos())
    render(await ColaSolicitudes())
    const tarjeta = screen.getByRole("article", { name: "Noticias Pasto" })
    expect(
      within(tarjeta).queryByRole("link", { name: "Noticias Pasto" })
    ).toBeNull()
  })

  it("guarda las atendidas recientes con su motivo y quién las atendió", async () => {
    const usuario = userEvent.setup()
    consultas.colaSolicitudes.mockResolvedValue(datos())
    render(await ColaSolicitudes())

    await usuario.click(screen.getByText("Atendidas recientemente"))
    const fila = screen
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes("Página personal"))
    expect(fila).toHaveTextContent("Descartada")
    expect(fila).toHaveTextContent("por Laura Gómez")
    expect(fila).toHaveTextContent("Motivo: Es una cuenta personal.")
  })

  it("vacía explica qué esperar y ofrece copiar el enlace del formulario", async () => {
    consultas.colaSolicitudes.mockResolvedValue(
      datos({ pendientes: [], atendidas: [], totalPendientes: 0 })
    )
    render(await ColaSolicitudes())

    expect(
      screen.getByText("No hay solicitudes de vinculación pendientes.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Copiar enlace del formulario" })
    ).toBeInTheDocument()
    expect(screen.queryByText("Atendidas recientemente")).toBeNull()
  })

  it("avisa cuando hay más pendientes de las que muestra", async () => {
    consultas.colaSolicitudes.mockResolvedValue(datos({ totalPendientes: 140 }))
    render(await ColaSolicitudes())
    expect(
      screen.getByText(/Mostramos las 100 más antiguas de 140/)
    ).toBeInTheDocument()
    expect(screen.getByText("140 solicitudes por atender")).toBeInTheDocument()
  })
})
