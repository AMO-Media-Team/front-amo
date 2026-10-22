import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  NuqsTestingAdapter,
  type OnUrlUpdateFunction,
} from "nuqs/adapters/testing"
import { describe, expect, it, vi } from "vitest"

import type {
  DatosDocumentosMedio,
  DocumentoCargado,
  PerfilTributario,
} from "../tipos"

const acciones = vi.hoisted(() => ({
  prepararSubidaDocumento: vi.fn(),
  confirmarDocumento: vi.fn(),
  firmarDocumento: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { PanelDocumentos } from "./panel-documentos"

const SIN_PAGO: PerfilTributario = {
  metodoPago: null,
  tipoDocumento: null,
  esDeclarante: false,
  obligadoFacturar: false,
  responsableIva: false,
}

const BANCARIO: PerfilTributario = {
  ...SIN_PAGO,
  metodoPago: "BANCARIO",
  tipoDocumento: "CC",
}

function aprobado(
  tipo: DocumentoCargado["tipo"],
  cambios: Partial<DocumentoCargado> = {}
): DocumentoCargado {
  return {
    id: `id-${tipo}`,
    tipo,
    estado: "APROBADO",
    metodo: "ARCHIVO",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-09-01T15:00:00Z",
    revisadoAt: "2026-09-02T15:00:00Z",
    formato: "image/webp",
    ...cambios,
  }
}

function datos(
  cambios: Partial<DatosDocumentosMedio> = {}
): DatosDocumentosMedio {
  return {
    medio: {
      id: "0192f1c2-5b6a-7d00-8000-000000000001",
      nombre: "Medio de prueba",
      estado: "PENDIENTE",
      nivel: 0,
      enviadoVerificacionAt: null,
    },
    perfil: SIN_PAGO,
    niveles: [
      {
        nivel: 1,
        nombre: "Persona natural informal",
        requisitos: [],
        documentos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA"],
      },
      {
        nivel: 2,
        nombre: "Persona natural con RUT",
        requisitos: [],
        documentos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA", "RUT"],
      },
      {
        nivel: 3,
        nombre: "Persona jurídica",
        requisitos: [],
        documentos: [
          "CEDULA_FRENTE",
          "CEDULA_REVERSO",
          "PRUEBA_VIDA",
          "RUT",
          "CAMARA_COMERCIO",
          "RUT_SOCIEDAD",
        ],
      },
    ],
    documentos: [],
    hoy: "2026-10-22",
    ...cambios,
  }
}

function dibujar(
  valor: DatosDocumentosMedio,
  busqueda = "",
  alActualizar?: OnUrlUpdateFunction
) {
  return render(
    <NuqsTestingAdapter
      searchParams={busqueda}
      onUrlUpdate={alActualizar}
      hasMemory
    >
      <PanelDocumentos datos={valor} />
    </NuqsTestingAdapter>
  )
}

function seccion(nombre: string | RegExp) {
  return screen.getByRole("region", { name: nombre })
}

function titulosDe(region: HTMLElement): string[] {
  return within(region)
    .getAllByRole("article")
    .map((tarjeta) => tarjeta.getAttribute("aria-labelledby") ?? "")
    .map((id) => document.getElementById(id)?.textContent ?? "")
}

describe("PanelDocumentos", () => {
  it("un medio nuevo ve el nivel de entrada y primero registra sus datos de pago", () => {
    dibujar(datos())
    const resumen = seccion("Te faltan 3 documentos")
    expect(
      within(resumen).getByText("0 de 4 aprobados para el nivel 1")
    ).toBeVisible()
    expect(within(resumen).getByText("1 opcional sin cargar")).toBeVisible()

    const lista = seccion("Documentos del nivel 1")
    expect(titulosDe(lista)).toEqual([
      "Documento de identidad (frente)",
      "Documento de identidad (reverso)",
      "Prueba de vida",
      "Certificado de tu medio de pago",
    ])
    expect(
      within(lista).getByRole("link", { name: "Registrar datos de pago" })
    ).toHaveAttribute("href", "/mi-medio/pago")
    expect(screen.getByRole("radio", { name: "Nivel 1" })).toBeChecked()
    expect(screen.getByText(/^Es el nivel de entrada/)).toBeVisible()
  })

  it("con lo necesario cargado invita a enviar el perfil desde Mi medio", () => {
    dibujar(
      datos({
        perfil: BANCARIO,
        documentos: [
          aprobado("CEDULA_FRENTE", { estado: "PENDIENTE" }),
          aprobado("CEDULA_REVERSO", { estado: "PENDIENTE" }),
          aprobado("CERT_BANCARIA", { estado: "PENDIENTE" }),
        ],
      })
    )
    const resumen = seccion("Ya cargaste lo necesario: lo estamos revisando")
    expect(
      within(resumen).getByText("Ya puedes enviar tu perfil a verificación")
    ).toBeVisible()
    expect(
      within(resumen).getByRole("link", { name: "Ir a Mi medio" })
    ).toHaveAttribute("href", "/mi-medio")
  })

  it("elegir otro nivel cambia la lista y queda en la URL", async () => {
    const alActualizar = vi.fn<OnUrlUpdateFunction>()
    dibujar(datos({ perfil: BANCARIO }), "", alActualizar)

    await userEvent.click(screen.getByRole("radio", { name: "Nivel 2" }))
    await waitFor(() =>
      expect(alActualizar.mock.lastCall?.[0].queryString).toBe("?nivel=2")
    )
    const lista = await screen.findByRole("region", {
      name: "Documentos del nivel 2",
    })
    expect(titulosDe(lista)).toContain("RUT")
    expect(
      screen.getByText(/verificarte directamente en ese nivel/)
    ).toBeVisible()

    // Volver al nivel inicial limpia el parámetro.
    await userEvent.click(screen.getByRole("radio", { name: "Nivel 1" }))
    await waitFor(() =>
      expect(alActualizar.mock.lastCall?.[0].queryString).toBe("")
    )
  })

  it("abre el nivel que pide la URL y deja aparte lo que ese nivel no exige", () => {
    dibujar(
      datos({
        perfil: BANCARIO,
        documentos: [aprobado("RUT", { formato: "application/pdf" })],
      }),
      "?nivel=1"
    )
    const otros = seccion("Otros documentos")
    expect(titulosDe(otros)).toEqual(["RUT", "Seguridad social"])
    expect(
      within(otros).getByText(
        "El nivel 1 no los exige, pero puedes cargarlos o mantenerlos al día."
      )
    ).toBeVisible()
  })

  it("con NIT sugiere el nivel de persona jurídica", async () => {
    dibujar(datos({ perfil: { ...BANCARIO, tipoDocumento: "NIT" } }))
    expect(
      screen.getByText(/como empresa, te corresponde el nivel 3/)
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole("button", { name: "Ver el nivel 3" })
    )
    expect(
      await screen.findByRole("region", { name: "Documentos del nivel 3" })
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: "Ver el nivel 3" })).toBeNull()
  })

  it("un medio verificado ve su nivel al día y marcado como actual", () => {
    dibujar(
      datos({
        medio: {
          id: "0192f1c2-5b6a-7d00-8000-000000000001",
          nombre: "Medio de prueba",
          estado: "VERIFICADO",
          nivel: 1,
          enviadoVerificacionAt: "2026-09-01T12:00:00Z",
        },
        perfil: BANCARIO,
        documentos: [
          aprobado("CEDULA_FRENTE"),
          aprobado("CEDULA_REVERSO"),
          aprobado("PRUEBA_VIDA", { metodo: "VIDEOLLAMADA", formato: null }),
          aprobado("CERT_BANCARIA", {
            formato: "application/pdf",
            venceEl: "2027-09-02",
          }),
        ],
      })
    )
    const resumen = seccion("Tus documentos están al día")
    expect(
      within(resumen).getByText("4 de 4 aprobados para el nivel 1")
    ).toBeVisible()
    expect(within(resumen).queryByText(/enviar tu perfil/)).toBeNull()
    expect(
      screen.getByRole("radio", { name: "Nivel 1, tu nivel actual" })
    ).toBeChecked()
    expect(screen.getByText(/^Es tu nivel actual/)).toBeVisible()
  })

  it("si ya lo envió, recuerda que está en revisión", () => {
    dibujar(
      datos({
        medio: {
          id: "0192f1c2-5b6a-7d00-8000-000000000001",
          nombre: "Medio de prueba",
          estado: "PENDIENTE",
          nivel: 0,
          enviadoVerificacionAt: "2026-10-20T15:00:00Z",
        },
      })
    )
    expect(screen.getByText("Tu perfil está en revisión")).toBeVisible()
  })
})
