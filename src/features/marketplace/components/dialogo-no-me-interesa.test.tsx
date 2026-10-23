import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  aceptarOferta: vi.fn(),
  rechazarOferta: vi.fn(),
  registrarVistaOferta: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const enrutador = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { SUGERENCIAS_NO_ME_INTERESA } from "../presentacion"
import { LONGITUD_MAXIMA_MOTIVO_RECHAZO } from "../schemas"
import { DialogoNoMeInteresa } from "./dialogo-no-me-interesa"

const OFERTA = "01a16693-730a-7983-9254-666751ffcd3b"

function renderizar() {
  const usuario = userEvent.setup()
  const onAbiertoChange = vi.fn()
  render(
    <DialogoNoMeInteresa
      abierto
      onAbiertoChange={onAbiertoChange}
      ofertaId={OFERTA}
      titulo="Historia de Instagram · Halloween"
    />
  )
  const dialogo = screen.getByRole("alertdialog", {
    name: "¿No te interesa esta oferta?",
  })
  return { usuario, dialogo: within(dialogo), onAbiertoChange }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("DialogoNoMeInteresa", () => {
  it("sin motivo quita la oferta y vuelve a «Ofertas»", async () => {
    acciones.rechazarOferta.mockResolvedValue(exito())
    const { usuario, dialogo } = renderizar()

    expect(
      dialogo.getByRole("textbox", { name: "Motivo (opcional)" })
    ).toHaveAccessibleDescription("Solo lo ve el equipo AMO.")
    await usuario.click(
      dialogo.getByRole("button", { name: "Quitar de mi lista" })
    )

    await waitFor(() => expect(enrutador.push).toHaveBeenCalledWith("/ofertas"))
    expect(acciones.rechazarOferta).toHaveBeenCalledWith({
      ofertaId: OFERTA,
      motivo: "",
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Listo: quitamos la oferta de tu lista",
      expect.objectContaining({
        description: expect.stringContaining("Ver las que rechacé"),
      })
    )
  })

  it("una sugerencia llena el motivo con un toque", async () => {
    acciones.rechazarOferta.mockResolvedValue(exito())
    const { usuario, dialogo } = renderizar()
    const sugerencia = SUGERENCIAS_NO_ME_INTERESA[1] as string

    await usuario.click(dialogo.getByRole("button", { name: sugerencia }))
    expect(dialogo.getByRole("button", { name: sugerencia })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(
      dialogo.getByRole("textbox", { name: "Motivo (opcional)" })
    ).toHaveValue(sugerencia)
    expect(
      dialogo.getByRole("textbox", { name: "Motivo (opcional)" })
    ).toHaveFocus()

    await usuario.click(
      dialogo.getByRole("button", { name: "Quitar de mi lista" })
    )
    await waitFor(() =>
      expect(acciones.rechazarOferta).toHaveBeenCalledWith({
        ofertaId: OFERTA,
        motivo: sugerencia,
      })
    )
  })

  it("un error del motivo queda junto al campo y el diálogo sigue abierto", async () => {
    acciones.rechazarOferta.mockResolvedValue(
      fallo("Ya habías aceptado esta oferta: cuéntanos por qué desistes.", {
        motivo: ["Ya habías aceptado esta oferta: cuéntanos por qué desistes."],
      })
    )
    const { usuario, dialogo, onAbiertoChange } = renderizar()

    await usuario.click(
      dialogo.getByRole("button", { name: "Quitar de mi lista" })
    )

    const campo = dialogo.getByRole("textbox", { name: "Motivo (opcional)" })
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"))
    expect(campo).toHaveAccessibleDescription(
      /Ya habías aceptado esta oferta: cuéntanos por qué desistes\./
    )
    expect(dialogo.getByRole("alert")).toBeVisible()
    expect(enrutador.push).not.toHaveBeenCalled()
    expect(onAbiertoChange).not.toHaveBeenCalledWith(false)
  })

  it("si la red falla lo dice sin cerrar", async () => {
    acciones.rechazarOferta.mockRejectedValue(new Error("Failed to fetch"))
    const { usuario, dialogo } = renderizar()

    await usuario.click(
      dialogo.getByRole("button", { name: "Quitar de mi lista" })
    )
    expect(await dialogo.findByRole("alert")).toHaveTextContent(
      /Revisa tu conexión/
    )
  })

  it("respeta el largo máximo del motivo", () => {
    const { dialogo } = renderizar()
    expect(
      dialogo.getByRole("textbox", { name: "Motivo (opcional)" })
    ).toHaveAttribute("maxLength", String(LONGITUD_MAXIMA_MOTIVO_RECHAZO))
  })
})
