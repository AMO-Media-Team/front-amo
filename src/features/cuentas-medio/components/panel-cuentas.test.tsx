import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  registrarCuenta: vi.fn(),
  editarCuenta: vi.fn(),
  quitarCuenta: vi.fn(),
  prepararCaptura: vi.fn(),
  firmarCaptura: vi.fn(),
  enviarVerificacionManual: vi.fn(),
  generarCodigoVerificacion: vi.fn(),
  enviarCapturaCodigo: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// El transporte real a Storage necesita las variables públicas de Supabase.
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import type {
  CuentaMedio,
  PanelCuentas as DatosPanel,
  VerificacionCuentaMedio,
} from "../tipos"
import { PanelCuentas } from "./panel-cuentas"

const AHORA = new Date("2026-10-22T15:00:00Z")
const DIA = 86_400_000

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * DIA).toISOString()
}

function cuenta(cambios: Partial<CuentaMedio>): CuentaMedio {
  return {
    id: "c-ig",
    plataforma: "INSTAGRAM",
    handle: "radiopasto",
    url: "https://www.instagram.com/radiopasto/",
    tarifaReferencia: null,
    verificada: false,
    seguidoresVerificados: null,
    franja: null,
    metodoVerificacion: null,
    ultimaVerificacionAt: null,
    creadaAt: haceDias(60),
    actualizadaAt: haceDias(60),
    verificaciones: [],
    ...cambios,
  }
}

const RECHAZO: VerificacionCuentaMedio = {
  id: "v-1",
  metodo: "MANUAL",
  estado: "RECHAZADA",
  seguidoresReportados: 35_000,
  seguidoresVerificados: null,
  tieneCaptura: true,
  capturaTipo: "image/webp",
  codigoExpiraAt: null,
  observaciones: "No se ve la fecha",
  creadaAt: haceDias(3),
  validadaAt: haceDias(2),
}

const VERIFICADA = cuenta({
  id: "c-ig",
  verificada: true,
  seguidoresVerificados: 40_000,
  franja: { clave: "F1", nombre: "30.000 – 60.000" },
  metodoVerificacion: "CODIGO_HISTORIA",
  ultimaVerificacionAt: haceDias(10),
  tarifaReferencia: 250_000,
})

const RECHAZADA = cuenta({
  id: "c-tt",
  plataforma: "TIKTOK",
  handle: "radiopasto.tt",
  url: "https://www.tiktok.com/@radiopasto.tt",
  verificaciones: [RECHAZO],
})

function panel(cuentas: CuentaMedio[]): DatosPanel {
  return {
    cuentas,
    franjas: [
      {
        id: "f1",
        clave: "F1",
        nombre: "30.000 – 60.000",
        seguidoresMin: 30_000,
        seguidoresMax: 60_000,
      },
    ],
    parametros: {
      diasVigencia: 30,
      diasGracia: 7,
      minutosCodigo: 60,
      umbralSeguidores: 30_000,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  for (const accion of Object.values(acciones)) accion.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("PanelCuentas", () => {
  it("sin cuentas invita a agregar la primera y explica la verificación", () => {
    render(<PanelCuentas panel={panel([])} ahoraServidor={AHORA.getTime()} />)
    expect(screen.getByText("Aún no registras cuentas")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Agregar tu primera cuenta/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Cómo funciona la verificación/ })
    ).toBeInTheDocument()
  })

  it("resume las cuentas y pinta una tarjeta por cuenta con su estado", () => {
    render(
      <PanelCuentas
        panel={panel([VERIFICADA, RECHAZADA])}
        ahoraServidor={AHORA.getTime()}
      />
    )
    const resumen = screen.getByRole("region", {
      name: "Resumen de tus cuentas",
    })
    expect(
      within(resumen).getByText(
        "1 de 2 cuentas reciben ofertas · 1 necesita tu atención."
      )
    ).toBeInTheDocument()

    const lista = screen.getByRole("list", { name: "Tus cuentas sociales" })
    const [instagram, tiktok] = within(lista).getAllByRole("article")

    expect(within(instagram).getByRole("heading")).toHaveTextContent(
      "Instagram: @radiopasto"
    )
    expect(within(instagram).getByText("Verificada")).toBeInTheDocument()
    expect(within(instagram).getByText("40.000")).toBeInTheDocument()
    expect(within(instagram).getByText("30.000 – 60.000")).toBeInTheDocument()
    expect(within(instagram).getByText(/· en 20 días/)).toBeInTheDocument()
    expect(within(instagram).getByText(/250\.000/)).toBeInTheDocument()
    expect(
      within(instagram).queryByRole("button", { name: /Verificar/ })
    ).toBeNull()
    expect(
      within(instagram).getByRole("link", {
        name: /instagram\.com\/radiopasto/,
      })
    ).toHaveAttribute("target", "_blank")

    expect(within(tiktok).getByText("No aprobada")).toBeInTheDocument()
    expect(
      within(tiktok).getByText(/Motivo: No se ve la fecha/)
    ).toBeInTheDocument()
    expect(
      within(tiktok).getByRole("button", { name: "Verificar de nuevo" })
    ).toBeInTheDocument()
    expect(
      within(tiktok).getByRole("button", {
        name: /Historial de verificaciones/,
      })
    ).toBeInTheDocument()
  })

  it("agregar: la hoja ofrece verificar la cuenta recién creada", async () => {
    const usuario = userEvent.setup()
    acciones.registrarCuenta.mockResolvedValue(
      exito({ id: "nueva", actualizadaAt: "x" })
    )
    render(
      <PanelCuentas
        panel={panel([VERIFICADA])}
        ahoraServidor={AHORA.getTime()}
      />
    )
    await usuario.click(screen.getByRole("button", { name: "Agregar cuenta" }))
    const hoja = screen.getByRole("dialog", { name: "Agregar cuenta" })
    await usuario.click(within(hoja).getByRole("radio", { name: "Facebook" }))
    await usuario.type(
      within(hoja).getByLabelText("Usuario o enlace del perfil"),
      "RadioPastoOficial"
    )
    await usuario.click(
      within(hoja).getByRole("button", { name: "Agregar cuenta" })
    )
    expect(
      await screen.findByText("Agregamos @RadioPastoOficial")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Verificar ahora" })
    ).toBeInTheDocument()
  })

  it("el menú de una cuenta sin verificar permite editarla y quitarla", async () => {
    const usuario = userEvent.setup()
    acciones.quitarCuenta.mockResolvedValue(exito())
    render(
      <PanelCuentas
        panel={panel([RECHAZADA])}
        ahoraServidor={AHORA.getTime()}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Más acciones para @radiopasto.tt" })
    )
    expect(
      await screen.findByRole("menuitem", { name: "Editar cuenta" })
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole("menuitem", { name: "Quitar cuenta" }))
    const dialogo = await screen.findByRole("alertdialog", {
      name: "¿Quitar @radiopasto.tt?",
    })
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Quitar cuenta" })
    )
    expect(acciones.quitarCuenta).toHaveBeenCalledWith({ cuentaId: "c-tt" })
  })

  it("una cuenta verificada solo deja editar la tarifa y reverificar antes de tiempo", async () => {
    const usuario = userEvent.setup()
    render(
      <PanelCuentas
        panel={panel([VERIFICADA])}
        ahoraServidor={AHORA.getTime()}
      />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Más acciones para @radiopasto" })
    )
    expect(
      await screen.findByRole("menuitem", { name: "Editar tarifa" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: "Reverificar ahora" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Quitar cuenta" })).toBeNull()
  })
})
