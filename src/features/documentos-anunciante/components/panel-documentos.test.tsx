import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DatosDocumentosAnunciante, DocumentoAnunciante } from "../tipos"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
const acciones = vi.hoisted(() => ({
  prepararSubidaDocumentoAnunciante: vi.fn(),
  confirmarDocumentoAnunciante: vi.fn(),
  firmarDocumentoAnunciante: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
// El transporte real (Supabase, TUS) no se usa: aquí no se sube nada.
vi.mock("@/components/archivos/entorno-navegador", () => ({
  ENTORNO_NAVEGADOR: {},
}))

import { PanelDocumentosAnunciante } from "./panel-documentos"

function documento(
  tipo: DocumentoAnunciante["tipo"],
  cambios: Partial<DocumentoAnunciante> = {}
): DocumentoAnunciante {
  return {
    id: `0192f1c2-5b6a-7d00-8000-0000000000${tipo === "RUT" ? "a1" : "a2"}`,
    tipo,
    estado: "PENDIENTE",
    observaciones: null,
    venceEl: null,
    cargadoAt: "2026-10-01T15:00:00Z",
    revisadoAt: null,
    formato: "application/pdf",
    ...cambios,
  }
}

function datos(
  cambios: Partial<DatosDocumentosAnunciante> = {},
  pais = "CO"
): DatosDocumentosAnunciante {
  return {
    empresa: {
      id: "0192f1c2-5b6a-7d00-8000-000000000001",
      nombre: "Andina",
      pais,
      estado: "PENDIENTE",
      enviadoVerificacionAt: null,
      identificacionCambiadaAt: null,
    },
    documentos: [],
    hoy: "2026-10-22",
    ...cambios,
  }
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PanelDocumentosAnunciante", () => {
  it("una empresa colombiana nueva ve el RUT y la Cámara por cargar, y los opcionales aparte", () => {
    render(<PanelDocumentosAnunciante datos={datos()} />)
    const resumen = seccion("Te faltan 2 documentos")
    expect(
      within(resumen).getByText("0 de 2 aprobados para la verificación")
    ).toBeVisible()
    expect(within(resumen).getByText("2 sin cargar")).toBeVisible()

    const exigidos = seccion("Para verificar tu empresa")
    expect(titulosDe(exigidos)).toEqual(["RUT", "Cámara de Comercio"])
    expect(within(exigidos).getAllByText("Sin cargar")).toHaveLength(2)
    expect(titulosDe(seccion("Otros documentos"))).toEqual([
      "Otro documento",
      "Certificado bancario",
    ])
    expect(screen.getAllByText("Opcional")).toHaveLength(2)
  })

  it("con todo cargado muestra lo que arma la página como siguiente paso", () => {
    render(
      <PanelDocumentosAnunciante
        datos={datos({
          documentos: [documento("RUT"), documento("CAMARA_COMERCIO")],
        })}
        siguiente={<p>Siguiente paso de prueba</p>}
      />
    )
    const resumen = seccion("Ya cargaste lo necesario")
    expect(within(resumen).getByText("2 en revisión")).toBeVisible()
    expect(within(resumen).getByText("Siguiente paso de prueba")).toBeVisible()
  })

  it("un rechazo se destaca con su motivo", () => {
    render(
      <PanelDocumentosAnunciante
        datos={datos({
          documentos: [
            documento("RUT", {
              estado: "RECHAZADO",
              observaciones: "RUT ilegible",
              revisadoAt: "2026-10-03T15:00:00Z",
            }),
          ],
        })}
      />
    )
    expect(seccion("Tienes 1 documento por corregir")).toBeVisible()
    const rut = screen.getByRole("article", { name: "RUT" })
    expect(within(rut).getByText("Rechazado")).toBeVisible()
    expect(within(rut).getByText("RUT ilegible")).toBeVisible()
    expect(
      within(rut).getByRole("button", { name: "Cargar de nuevo" })
    ).toBeVisible()
  })

  it("un aprobado de antes del cambio de identificación se pide de nuevo", () => {
    const base = datos()
    render(
      <PanelDocumentosAnunciante
        datos={{
          ...base,
          empresa: {
            ...base.empresa,
            identificacionCambiadaAt: "2026-10-15T12:00:00Z",
          },
          documentos: [
            documento("RUT", {
              estado: "APROBADO",
              revisadoAt: "2026-10-10T15:00:00Z",
            }),
            documento("CAMARA_COMERCIO"),
          ],
        }}
      />
    )
    const resumen = seccion("Tienes 1 documento por corregir")
    expect(
      within(resumen).getByText("0 de 2 aprobados para la verificación")
    ).toBeVisible()
    const rut = screen.getByRole("article", { name: "RUT" })
    expect(within(rut).getByText("Desactualizado")).toBeVisible()
    expect(
      within(rut).getByText(
        "Carga de nuevo: la identificación de la empresa cambió después de aprobarlo."
      )
    ).toBeVisible()
    expect(
      within(rut).getByRole("button", { name: "Cargar de nuevo" })
    ).toBeVisible()
  })

  it("una empresa del exterior ve que basta con un documento de existencia", () => {
    render(<PanelDocumentosAnunciante datos={datos({}, "US")} />)
    expect(seccion("Te falta 1 documento")).toBeVisible()
    const exigidos = seccion("Para verificar tu empresa")
    expect(within(exigidos).getByText(/^Basta con uno de estos/)).toBeVisible()
    expect(titulosDe(exigidos)).toEqual([
      "Certificado de existencia",
      "Otro documento",
    ])
    // El RUT es colombiano: no se le ofrece.
    expect(titulosDe(seccion("Otros documentos"))).toEqual([
      "Certificado bancario",
    ])
  })

  it("«Cargar» abre la hoja con consejos y la zona para elegir el archivo", async () => {
    render(<PanelDocumentosAnunciante datos={datos()} />)
    await userEvent.click(
      within(screen.getByRole("article", { name: "RUT" })).getByRole("button", {
        name: "Cargar",
      })
    )
    const hoja = await screen.findByRole("dialog", { name: "RUT" })
    expect(
      within(hoja).getByRole("heading", {
        name: "Para que lo aprueben a la primera",
      })
    ).toBeVisible()
    expect(
      within(hoja).getByRole("button", { name: "Elegir archivo" })
    ).toBeVisible()
  })
})
