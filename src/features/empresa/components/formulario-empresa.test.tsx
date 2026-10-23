import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { CatalogosAnunciante } from "@/features/gestion-anunciantes/tipos"
import { exito, fallo } from "@/lib/result"

import { EMPRESA_DESACTUALIZADA } from "../errores"
import type { EmpresaPropia } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({ editarMiEmpresa: vi.fn() }))
vi.mock("../actions", () => acciones)
const territorio = vi.hoisted(() => ({
  listarDepartamentosActivos: vi.fn(),
  listarMunicipiosActivos: vi.fn(),
}))
vi.mock("@/features/territorio/actions", () => territorio)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { FormularioEmpresa } from "./formulario-empresa"

const SECTOR = "0192f1c2-5b6a-7d00-8000-0000000000c1"

const CATALOGOS: CatalogosAnunciante = {
  sectores: [{ id: SECTOR, nombre: "Retail" }],
  paises: [
    { iso2: "CO", nombre: "Colombia" },
    { iso2: "US", nombre: "Estados Unidos" },
  ],
}

const EMPRESA: EmpresaPropia = {
  id: "0192f1c2-5b6a-7d00-8000-000000000001",
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
    email: "facturas@andina.co",
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
        codigo: "11",
        nombre: "Bogotá, D.C.",
        nombreCorto: "Bogotá",
        region: "Andina",
      },
    ])
  )
  territorio.listarMunicipiosActivos.mockResolvedValue(
    exito([
      {
        codigo: "11001",
        nombre: "Bogotá, D.C.",
        departamentoCodigo: "11",
        esCapital: true,
      },
    ])
  )
})

function pintar(
  empresa: EmpresaPropia = EMPRESA,
  { bloqueada = false }: { bloqueada?: boolean } = {}
) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={cliente}>
      <FormularioEmpresa
        empresa={empresa}
        catalogos={CATALOGOS}
        identificacionBloqueada={bloqueada}
      />
    </QueryClientProvider>
  )
}

describe("FormularioEmpresa", () => {
  it("mientras no está verificada, la identificación se edita (NIT y DV)", () => {
    pintar()
    expect(screen.getByLabelText("Razón social")).toHaveValue(
      "Comercializadora Andina S.A.S."
    )
    expect(screen.getByRole("textbox", { name: "NIT" })).toHaveValue(
      "900.123.456"
    )
    expect(
      screen.getByRole("textbox", { name: /dígito de verificación/ })
    ).toHaveValue("8")
    expect(screen.getByText("Condición tributaria")).toBeVisible()
    expect(
      screen.queryByRole("region", { name: "Cambios sin guardar" })
    ).toBeNull()
  })

  it("verificada, razón social, país y NIT son de solo lectura y se explica por qué", () => {
    pintar({ ...EMPRESA, estado: "VERIFICADO" }, { bloqueada: true })
    const razon = screen.getByRole("textbox", { name: "Razón social" })
    expect(razon).toHaveValue("Comercializadora Andina S.A.S.")
    expect(razon).toHaveAttribute("readonly")
    expect(razon).toHaveAccessibleDescription(
      /solo los corrige el equipo de AMO/
    )
    expect(screen.getByRole("textbox", { name: "NIT" })).toHaveValue(
      "900.123.456-8"
    )
    expect(screen.getByRole("textbox", { name: "País" })).toHaveValue(
      "Colombia"
    )
    expect(
      screen.queryByRole("textbox", { name: /dígito de verificación/ })
    ).toBeNull()
    // Lo demás sigue editable.
    expect(screen.getByLabelText("Nombre comercial")).not.toHaveAttribute(
      "readonly"
    )
  })

  it("envía lo escrito con lo que había al abrir y confirma", async () => {
    const usuario = userEvent.setup()
    acciones.editarMiEmpresa.mockResolvedValue(
      exito({ actualizadoAt: "2026-10-22T15:10:00Z" })
    )
    pintar()
    const nombre = screen.getByLabelText("Nombre comercial")
    await usuario.clear(nombre)
    await usuario.type(nombre, "Andina Express")
    expect(
      screen.getByRole("region", { name: "Cambios sin guardar" })
    ).toBeVisible()
    await usuario.click(screen.getByRole("button", { name: "Guardar datos" }))

    await waitFor(() =>
      expect(acciones.editarMiEmpresa).toHaveBeenCalledTimes(1)
    )
    const [valores, original] = acciones.editarMiEmpresa.mock.calls[0]
    expect(valores).toMatchObject({
      nombreComercial: "Andina Express",
      actualizadoAt: EMPRESA.actualizadoAt,
    })
    expect(original).toMatchObject({
      nombreComercial: "Andina",
      actualizadoAt: EMPRESA.actualizadoAt,
    })
    expect(avisos.success).toHaveBeenCalledWith("Datos de la empresa guardados")
  })

  it("un DV incorrecto se marca en su campo y no llega al servidor (ANU-001)", async () => {
    const usuario = userEvent.setup()
    pintar()
    const dv = screen.getByRole("textbox", { name: /dígito de verificación/ })
    await usuario.clear(dv)
    await usuario.type(dv, "7")
    await usuario.click(screen.getByRole("button", { name: "Guardar datos" }))
    expect(
      await screen.findByText(
        "No corresponde al NIT: para 900.123.456 es 8. Revisa ambos en el RUT."
      )
    ).toBeInTheDocument()
    expect(acciones.editarMiEmpresa).not.toHaveBeenCalled()
  })

  it("si otra persona cambió lo mismo, ofrece cargar los datos vigentes", async () => {
    const usuario = userEvent.setup()
    acciones.editarMiEmpresa.mockResolvedValue(fallo(EMPRESA_DESACTUALIZADA))
    pintar()
    await usuario.type(screen.getByLabelText("Nombre comercial"), " 2")
    await usuario.click(screen.getByRole("button", { name: "Guardar datos" }))
    const aviso = await screen.findByRole("alert")
    expect(within(aviso).getByText(EMPRESA_DESACTUALIZADA)).toBeVisible()
    await usuario.click(
      within(aviso).getByRole("button", { name: "Cargar los datos vigentes" })
    )
    expect(enrutador.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("Nombre comercial")).toHaveValue("Andina")
  })

  it("una empresa del exterior no ve la condición tributaria colombiana", () => {
    pintar({
      ...EMPRESA,
      paisIso2: "US",
      nit: null,
      digitoVerificacion: null,
      municipioCodigo: null,
      identificacionExtranjera: "EIN 12-3456789",
      ciudadExtranjera: "Miami",
    })
    expect(screen.queryByText("Condición tributaria")).toBeNull()
    expect(screen.getByLabelText("Identificación tributaria")).toHaveValue(
      "EIN 12-3456789"
    )
  })
})
