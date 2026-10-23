import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  consultarSeguimiento: vi.fn(),
  firmarCaptura: vi.fn(),
  consultarPerfilMedio: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { asignacionPrueba } from "../fixtures"
import type { PerfilMedio } from "../tipos"
import { FichaMedio } from "./ficha-medio"

const { medio, cuenta } = asignacionPrueba()

const PERFIL: PerfilMedio = {
  id: medio.id,
  nombre: medio.nombre,
  tipo: "PAGINA_NOTICIAS",
  municipio: "Sincelejo",
  departamento: "Sucre",
  nivel: 2,
  tasaCumplimiento: 0.96,
  nCumplimiento: 25,
  publicacionesVerificadas: 40,
  cuentas: [
    {
      plataforma: "INSTAGRAM",
      handle: "comunidadsincelejo",
      url: "https://www.instagram.com/comunidadsincelejo/",
      seguidores: 113398,
      franja: "F2",
      alcanceMediano: 8000,
    },
    {
      plataforma: "FACEBOOK",
      handle: null,
      url: "https://www.facebook.com/comunidadsincelejo",
      seguidores: 45000,
      franja: "F1",
      alcanceMediano: null,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function abrir() {
  const usuario = userEvent.setup()
  render(<FichaMedio medio={medio} cuenta={cuenta} />)
  await usuario.click(
    screen.getByRole("button", { name: /Comunidad Sincelejo/ })
  )
  return {
    usuario,
    dialogo: await screen.findByRole("dialog", { name: "Comunidad Sincelejo" }),
  }
}

describe("FichaMedio", () => {
  it("abre la ficha pública: tipo, cumplimiento, cuentas y la nota de privacidad", async () => {
    acciones.consultarPerfilMedio.mockResolvedValue(exito(PERFIL))
    const { dialogo } = await abrir()

    expect(acciones.consultarPerfilMedio).toHaveBeenCalledWith({
      medioId: medio.id,
    })
    expect(
      await within(dialogo).findByText("Página de noticias")
    ).toBeInTheDocument()
    expect(within(dialogo).getByText("Sincelejo, Sucre")).toBeInTheDocument()
    expect(
      within(dialogo).getByText(/^96\s?%\sde 25 negocios$/)
    ).toBeInTheDocument()
    expect(within(dialogo).getByText("40")).toBeInTheDocument()
    expect(
      within(dialogo).getByText("113.398 seguidores al aceptar · Franja F2")
    ).toBeInTheDocument()
    expect(
      within(dialogo).getByText(
        "113.398 seguidores · Franja F2 · Alcance mediano 8.000"
      )
    ).toBeInTheDocument()
    expect(
      within(dialogo).getByText(
        /no comparte los documentos, los datos de contacto/
      )
    ).toBeInTheDocument()
    expect(dialogo.textContent).not.toMatch(/NIT|cuenta bancaria|correo/i)
  })

  it("si la BD ya no entrega el perfil, muestra lo que trae la asignación", async () => {
    acciones.consultarPerfilMedio.mockResolvedValue(exito(null))
    const { dialogo } = await abrir()
    expect(
      await within(dialogo).findByText(/ya no está disponible para tu empresa/)
    ).toBeInTheDocument()
    expect(
      within(dialogo).getByRole("link", { name: /@comunidadsincelejo/ })
    ).toHaveAttribute("href", cuenta.url)
  })

  it("un fallo se explica dentro del diálogo y se puede reintentar", async () => {
    acciones.consultarPerfilMedio
      .mockResolvedValueOnce(fallo("No pudimos cargar el perfil del medio."))
      .mockResolvedValueOnce(exito(PERFIL))
    const { usuario, dialogo } = await abrir()
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(
      "No pudimos cargar el perfil del medio."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Reintentar" })
    )
    expect(
      await within(dialogo).findByText("Página de noticias")
    ).toBeInTheDocument()
    expect(acciones.consultarPerfilMedio).toHaveBeenCalledTimes(2)
  })
})
