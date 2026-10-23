import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const acciones = vi.hoisted(() => ({ enviarEmpresaAVerificacion: vi.fn() }))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

import { SiguientePasoDocumentos } from "./siguiente-paso-documentos"

const ALTA = { estado: "PENDIENTE" as const, enviadoVerificacionAt: null }

describe("SiguientePasoDocumentos", () => {
  it("con lo necesario cargado y el contacto completo, se envía desde aquí", () => {
    render(
      <SiguientePasoDocumentos
        empresa={ALTA}
        resumen={{ listoParaEnviar: true }}
        conContacto
      />
    )
    expect(
      screen.getByText("Ya puedes enviar tu empresa a verificación")
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Enviar a verificación" })
    ).not.toHaveAttribute("aria-disabled")
  })

  it("sin contacto, lleva a completarlo", () => {
    render(
      <SiguientePasoDocumentos
        empresa={ALTA}
        resumen={{ listoParaEnviar: true }}
        conContacto={false}
      />
    )
    expect(
      screen.getByRole("link", { name: "Completar la persona de contacto" })
    ).toHaveAttribute("href", "/empresa#contacto")
  })

  it("rechazada, invita a volver a enviarla", () => {
    render(
      <SiguientePasoDocumentos
        empresa={{ ...ALTA, estado: "RECHAZADO" }}
        resumen={{ listoParaEnviar: true }}
        conContacto
      />
    )
    expect(
      screen.getByRole("button", { name: "Volver a enviar" })
    ).toBeVisible()
  })

  it("en revisión recuerda que no hace falta reenviar", () => {
    render(
      <SiguientePasoDocumentos
        empresa={{ ...ALTA, enviadoVerificacionAt: "2026-10-20T15:00:00Z" }}
        resumen={{ listoParaEnviar: false }}
        conContacto
      />
    )
    expect(screen.getByText("Tu empresa está en revisión")).toBeVisible()
    expect(screen.getByText(/no hace falta volver a enviarla/)).toBeVisible()
  })

  it("si falta algún documento, o ya está verificada, no agrega nada", () => {
    const { container, rerender } = render(
      <SiguientePasoDocumentos
        empresa={ALTA}
        resumen={{ listoParaEnviar: false }}
        conContacto
      />
    )
    expect(container).toBeEmptyDOMElement()
    rerender(
      <SiguientePasoDocumentos
        empresa={{ ...ALTA, estado: "VERIFICADO" }}
        resumen={{ listoParaEnviar: true }}
        conContacto
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
