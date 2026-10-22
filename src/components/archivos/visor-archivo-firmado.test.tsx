import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { VisorArchivoFirmado } from "./visor-archivo-firmado"

const firmada = (url: string) => exito({ url, vigenciaSegundos: 300 })

afterEach(() => {
  vi.useRealTimers()
})

describe("VisorArchivoFirmado", () => {
  it("un PDF se abre en una pestaña nueva con la URL firmada", async () => {
    const firmar = vi.fn(async () => firmada("https://x/firmada/1"))
    render(
      <VisorArchivoFirmado
        firmar={firmar}
        nombre="RUT.pdf"
        tipo="application/pdf"
        tamano={1024 * 1024}
      />
    )
    const enlace = await screen.findByRole("link", { name: /Abrir PDF/ })
    expect(enlace).toHaveAttribute("href", "https://x/firmada/1")
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByText("RUT.pdf")).toBeInTheDocument()
    expect(firmar).toHaveBeenCalledOnce()
  })

  it("renueva la URL antes de que venza", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    const firmar = vi
      .fn()
      .mockResolvedValueOnce(firmada("https://x/firmada/1"))
      .mockResolvedValueOnce(firmada("https://x/firmada/2"))
    render(<VisorArchivoFirmado firmar={firmar} nombre="contrato.pdf" />)
    await act(async () => {})
    expect(screen.getByRole("link", { name: /Abrir PDF/ })).toHaveAttribute(
      "href",
      "https://x/firmada/1"
    )

    await act(async () => {
      vi.advanceTimersByTime(239_000)
    })
    expect(firmar).toHaveBeenCalledOnce()

    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(firmar).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("link", { name: /Abrir PDF/ })).toHaveAttribute(
      "href",
      "https://x/firmada/2"
    )
  })

  it("muestra el error del servidor y permite reintentar", async () => {
    const firmar = vi
      .fn()
      .mockResolvedValueOnce(
        fallo("No encontramos el archivo o no tienes acceso a él.")
      )
      .mockResolvedValueOnce(firmada("https://x/firmada/3"))
    render(<VisorArchivoFirmado firmar={firmar} nombre="soporte.pdf" />)
    expect(
      await screen.findByText(
        "No encontramos el archivo o no tienes acceso a él."
      )
    ).toBeInTheDocument()
    // En una lista de documentos, el error dice de cuál se trata.
    expect(screen.getByText("soporte.pdf")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(
      await screen.findByRole("link", { name: /Abrir PDF/ })
    ).toHaveAttribute("href", "https://x/firmada/3")
  })

  it("una foto HEIC no se intenta mostrar en línea: se ofrece abrirla", async () => {
    const firmar = vi.fn(async () => firmada("https://x/firmada/cedula.heic"))
    render(
      <VisorArchivoFirmado
        firmar={firmar}
        nombre="cedula.heic"
        tipo="image/heic"
      />
    )
    expect(
      await screen.findByRole("link", { name: /Abrir en pestaña nueva/ })
    ).toHaveAttribute("href", "https://x/firmada/cedula.heic")
    expect(screen.queryByRole("img")).toBeNull()
    expect(firmar).toHaveBeenCalledOnce()
  })

  it("una imagen se muestra en línea con su texto alternativo", async () => {
    render(
      <VisorArchivoFirmado
        firmar={async () => firmada("https://x/firmada/foto.webp")}
        nombre="captura.webp"
        descripcion="Captura del panel de Instagram"
      />
    )
    const imagen = await screen.findByRole("img", {
      name: "Captura del panel de Instagram",
    })
    expect(imagen).toHaveAttribute("src", "https://x/firmada/foto.webp")
    expect(
      screen.getByRole("link", { name: /Abrir en pestaña nueva/ })
    ).toBeInTheDocument()
  })
})
