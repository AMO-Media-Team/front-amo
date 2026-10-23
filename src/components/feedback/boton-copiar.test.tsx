import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { BotonCopiar } from "./boton-copiar"

describe("BotonCopiar", () => {
  it("copia el texto y anuncia que quedó copiado", async () => {
    const usuario = userEvent.setup()
    const escribir = vi.spyOn(navigator.clipboard, "writeText")
    render(
      <BotonCopiar texto="#publicidad #cafe" etiqueta="Copiar los hashtags" />
    )
    await usuario.click(
      screen.getByRole("button", { name: "Copiar los hashtags" })
    )
    expect(escribir).toHaveBeenCalledWith("#publicidad #cafe")
    expect(await screen.findByRole("button", { name: "Copiado" })).toBeVisible()
  })

  it("sin texto no hay nada que copiar", () => {
    render(<BotonCopiar texto="" etiqueta="Copiar el enlace" />)
    expect(
      screen.getByRole("button", { name: "Copiar el enlace" })
    ).toBeDisabled()
  })
})
