import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import { versionPrueba } from "../fixtures"
import {
  ESPERA_AUTOGUARDADO_MS,
  FormularioTextos,
  valoresIniciales,
} from "./formulario-textos"

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

function montar(onGuardar = vi.fn(async () => exito(versionPrueba()))) {
  const onEstado = vi.fn()
  const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(
    <FormularioTextos
      version={null}
      onGuardar={onGuardar}
      onEstado={onEstado}
    />
  )
  return { usuario, onGuardar, onEstado }
}

describe("FormularioTextos", () => {
  it("parte de los textos de la versión", () => {
    expect(valoresIniciales(versionPrueba())).toEqual({
      copySugerido: "Conoce la promoción de temporada.",
      hashtags: ["#Publicidad", "#MiMarca"],
      menciones: ["@mimarca"],
      enlaceDestino: "https://mimarca.co/promo",
    })
    expect(valoresIniciales(null)).toEqual({
      copySugerido: "",
      hashtags: [],
      menciones: [],
      enlaceDestino: "",
    })
  })

  it("las ayudas no hablan en voz del anunciante (también lo usa el equipo AMO)", () => {
    montar()
    expect(
      screen.getByText(
        "Cuentas que el medio debe etiquetar, por ejemplo la de la marca."
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/tu marca/)).toBeNull()
  })

  it("guarda solo tras una pausa al escribir", async () => {
    const { usuario, onGuardar, onEstado } = montar()
    await usuario.type(
      screen.getByRole("textbox", { name: /Copy sugerido/ }),
      "Hola"
    )
    expect(screen.getByText("Cambios sin guardar…")).toBeInTheDocument()
    expect(onGuardar).not.toHaveBeenCalled()
    expect(onEstado).toHaveBeenLastCalledWith("sin-guardar")
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_AUTOGUARDADO_MS)
    })
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        copySugerido: "Hola",
        hashtags: [],
        menciones: [],
        enlaceDestino: "",
      })
    )
    expect(await screen.findByText("Textos guardados")).toBeInTheDocument()
    expect(onEstado).toHaveBeenLastCalledWith("guardados")
  })

  it("completa el enlace con https:// al salir y lo guarda", async () => {
    const { usuario, onGuardar } = montar()
    const enlace = screen.getByRole("textbox", { name: /Enlace de destino/ })
    await usuario.type(enlace, "mimarca.co/promo")
    await usuario.tab()
    expect(enlace).toHaveValue("https://mimarca.co/promo")
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ enlaceDestino: "https://mimarca.co/promo" })
      )
    )
  })

  it("no guarda un enlace inseguro y lo explica junto al campo", async () => {
    const { usuario, onGuardar, onEstado } = montar()
    const enlace = screen.getByRole("textbox", { name: /Enlace de destino/ })
    await usuario.type(enlace, "http://mimarca.co")
    await usuario.tab()
    await act(async () => {
      vi.advanceTimersByTime(ESPERA_AUTOGUARDADO_MS)
    })
    await waitFor(() =>
      expect(enlace).toHaveAccessibleDescription(/Usa un enlace seguro/)
    )
    expect(enlace).toHaveAttribute("aria-invalid", "true")
    expect(onGuardar).not.toHaveBeenCalled()
    expect(onEstado).toHaveBeenLastCalledWith("invalidos")
  })

  it("muestra el error del servidor con «Reintentar»", async () => {
    const onGuardar = vi
      .fn()
      .mockResolvedValueOnce(fallo("No pudimos completar la operación."))
      .mockResolvedValueOnce(exito(versionPrueba()))
    const { usuario } = montar(onGuardar)
    await usuario.type(
      screen.getByRole("textbox", { name: /Copy sugerido/ }),
      "Hola"
    )
    await usuario.tab()
    expect(
      await screen.findByText("No pudimos completar la operación.")
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(await screen.findByText("Textos guardados")).toBeInTheDocument()
    expect(onGuardar).toHaveBeenCalledTimes(2)
  })

  it("cuenta los caracteres del copy", async () => {
    const { usuario } = montar()
    const copy = screen.getByRole("textbox", { name: /Copy sugerido/ })
    await usuario.type(copy, "Hola 👋")
    expect(copy).toHaveAccessibleDescription(/6 de 2\.200 caracteres/)
  })
})
