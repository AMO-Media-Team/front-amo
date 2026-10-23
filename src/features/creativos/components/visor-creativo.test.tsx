import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import { archivoPrueba, versionPrueba } from "../fixtures"
import { VisorCreativo } from "./visor-creativo"

const simulados = vi.hoisted(() => ({
  firmarArchivoCreativo: vi.fn(),
  firmarArchivosVersion: vi.fn(),
}))

vi.mock("../actions", () => ({
  firmarArchivoCreativo: simulados.firmarArchivoCreativo,
  firmarArchivosVersion: simulados.firmarArchivosVersion,
  leerCreativoEditable: vi.fn(),
}))

function conConsultas(hijo: ReactNode) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={cliente}>{hijo}</QueryClientProvider>
}

simulados.firmarArchivoCreativo.mockResolvedValue(
  exito({ url: "https://storage.test/archivo", vigenciaSegundos: 300 })
)
simulados.firmarArchivosVersion.mockResolvedValue(
  exito({ archivos: {}, vigenciaSegundos: 300 })
)

describe("VisorCreativo", () => {
  it("muestra los textos con el enlace seguro en otra pestaña", () => {
    render(conConsultas(<VisorCreativo version={versionPrueba()} />))
    expect(
      screen.getByText("Conoce la promoción de temporada.")
    ).toBeInTheDocument()
    const hashtags = screen.getByText("Hashtags").closest("div")
    expect(hashtags).toHaveTextContent("#Publicidad")
    expect(hashtags).toHaveTextContent("#MiMarca")
    const enlace = screen.getByRole("link", { name: /mimarca\.co\/promo/ })
    expect(enlace).toHaveAttribute("href", "https://mimarca.co/promo")
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer nofollow")
    expect(
      screen.getByText("Esta versión aún no tiene archivos.")
    ).toBeInTheDocument()
  })

  it("explica los textos vacíos", () => {
    render(
      conConsultas(
        <VisorCreativo
          version={versionPrueba({
            copySugerido: null,
            hashtags: [],
            menciones: [],
            enlaceDestino: null,
          })}
        />
      )
    )
    expect(screen.getByText(/Sin copy sugerido/)).toBeInTheDocument()
    expect(screen.getByText("Sin hashtags.")).toBeInTheDocument()
    expect(screen.getByText("Sin enlace de destino.")).toBeInTheDocument()
  })

  it("con varios archivos pasa de uno a otro y lo anuncia", async () => {
    const usuario = userEvent.setup()
    const version = versionPrueba({
      tipo: "CARRUSEL",
      archivos: [
        archivoPrueba({ id: "a", mime: "image/jpeg", orden: 0 }),
        archivoPrueba({ id: "b", mime: "image/jpeg", orden: 1 }),
      ],
    })
    render(conConsultas(<VisorCreativo version={version} />))
    const archivos = screen.getByRole("list", {
      name: "Archivos de la versión 1",
    })
    const segunda = within(archivos).getByRole("button", {
      name: "Imagen 2 de 2",
    })
    expect(
      screen.getByRole("button", { name: "Archivo anterior" })
    ).toBeDisabled()
    await usuario.click(segunda)
    expect(segunda).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Mostrando imagen 2 de 2.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Archivo siguiente" })
    ).toBeDisabled()
    expect(simulados.firmarArchivoCreativo).toHaveBeenLastCalledWith({
      archivoId: "b",
    })
  })

  it("deja ver la huella del original en los datos técnicos", () => {
    render(
      conConsultas(
        <VisorCreativo
          version={versionPrueba({
            archivos: [archivoPrueba({ sha256: "0123456789abcdef".repeat(4) })],
          })}
        />
      )
    )
    expect(screen.getByText("01234567…89abcdef")).toHaveAttribute(
      "title",
      "0123456789abcdef".repeat(4)
    )
  })
})
