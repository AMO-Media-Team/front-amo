import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import type { DatosMiEmpresa } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  editarMiEmpresa: vi.fn(),
  guardarContactoEmpresa: vi.fn(),
  prepararSubidaLogo: vi.fn(),
  confirmarLogo: vi.fn(),
  quitarLogo: vi.fn(),
  enviarEmpresaAVerificacion: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const territorio = vi.hoisted(() => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => territorio)
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { PanelEmpresa } from "./panel-empresa"

const SECTOR = "0192f1c2-5b6a-7d00-8000-0000000000c1"
const ID = "0192f1c2-5b6a-7d00-8000-000000000001"

function datos(
  cambios: Partial<DatosMiEmpresa["empresa"]> = {}
): DatosMiEmpresa {
  return {
    empresa: {
      id: ID,
      razonSocial: "Comercializadora Andina S.A.S.",
      nombreComercial: "Andina",
      sector: { id: SECTOR, nombre: "Retail" },
      paisIso2: "CO",
      nit: "900123456",
      digitoVerificacion: "8",
      municipioCodigo: "11001",
      identificacionExtranjera: null,
      ciudadExtranjera: null,
      facturacion: {
        email: null,
        regimen: null,
        granContribuyente: false,
        autorretenedor: false,
      },
      estado: "PENDIENTE",
      motivoEstado: null,
      enviadoVerificacionAt: null,
      verificadoAt: null,
      actualizadoAt: "2026-10-22T15:00:00Z",
      logoUrl: null,
      tieneLogo: false,
      ...cambios,
    },
    contacto: {
      nombre: null,
      email: null,
      celular: null,
      direccion: null,
      actualizadoAt: null,
    },
    catalogos: {
      sectores: [{ id: SECTOR, nombre: "Retail" }],
      paises: [{ iso2: "CO", nombre: "Colombia" }],
    },
    documentos: {
      empresa: {
        id: ID,
        nombre: "Andina",
        pais: "CO",
        estado: cambios.estado ?? "PENDIENTE",
        enviadoVerificacionAt: cambios.enviadoVerificacionAt ?? null,
        identificacionCambiadaAt: null,
      },
      documentos: [],
      hoy: "2026-10-22",
    },
  }
}

function pintar(valor: DatosMiEmpresa) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cliente}>
      <PanelEmpresa datos={valor} />
    </QueryClientProvider>
  )
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
  territorio.listarDepartamentosActivos.mockResolvedValue(exito([]))
  territorio.listarMunicipiosActivos.mockResolvedValue(exito([]))
})

describe("PanelEmpresa", () => {
  it("una empresa en alta ve qué falta, sus formularios y el logo", () => {
    pintar(datos())
    const verificacion = screen.getByRole("region", {
      name: "Verifica tu empresa",
    })
    expect(
      within(verificacion).getByRole("button", {
        name: "Enviar a verificación",
      })
    ).toHaveAttribute("aria-disabled", "true")
    expect(
      within(verificacion).getByRole("link", { name: /Datos de la empresa/ })
    ).toHaveAttribute("href", "/empresa#datos")
    expect(
      screen.getByRole("form", { name: "Datos de la empresa" })
    ).toHaveAttribute("id", "datos")
    expect(
      screen.getByRole("form", { name: "Persona de contacto" })
    ).toHaveAttribute("id", "contacto")
    expect(screen.getByRole("region", { name: "Logo" })).toBeVisible()
    // La identificación aún se corrige.
    expect(screen.getByRole("textbox", { name: "NIT" })).not.toHaveAttribute(
      "readonly"
    )
  })

  it("en revisión no ofrece enviar de nuevo", () => {
    pintar(datos({ enviadoVerificacionAt: "2026-10-20T15:00:00Z" }))
    expect(
      screen.getByRole("region", { name: "Tu empresa está en revisión" })
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Enviar a verificación" })
    ).toBeNull()
    expect(
      screen.getByText(/no hace falta volver a enviar tu empresa/)
    ).toBeVisible()
  })

  it("verificada: sin pasos y con la identificación de solo lectura", () => {
    pintar(
      datos({ estado: "VERIFICADO", verificadoAt: "2026-10-01T15:00:00Z" })
    )
    expect(
      screen.getByRole("region", { name: "Tu empresa está verificada" })
    ).toBeVisible()
    expect(
      screen.queryByRole("link", { name: /Persona de contacto/ })
    ).toBeNull()
    expect(screen.getByRole("textbox", { name: "NIT" })).toHaveAttribute(
      "readonly"
    )
  })

  it("rechazada: motivo y «Volver a enviar»", () => {
    pintar(datos({ estado: "RECHAZADO", motivoEstado: "RUT ilegible" }))
    expect(screen.getByText("RUT ilegible")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Volver a enviar" })
    ).toHaveAttribute("aria-disabled", "true")
  })
})
