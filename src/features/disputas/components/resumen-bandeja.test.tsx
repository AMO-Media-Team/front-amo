import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import { describe, expect, it, vi } from "vitest"

import { ResumenBandeja } from "./resumen-bandeja"

const RESUMEN = { abiertas: 3, en_revision: 2, cerradas: 41 }

function renderizar(searchParams = "") {
  const usuario = userEvent.setup()
  const alActualizar = vi.fn<(evento: UrlUpdateEvent) => void>()
  render(
    <NuqsTestingAdapter
      searchParams={searchParams}
      onUrlUpdate={alActualizar}
      hasMemory
    >
      <ResumenBandeja resumen={RESUMEN} />
    </NuqsTestingAdapter>
  )
  return { usuario, alActualizar }
}

function ultimaUrl(alActualizar: ReturnType<typeof vi.fn>): string {
  const evento = alActualizar.mock.calls.at(-1)?.[0] as
    UrlUpdateEvent | undefined
  return evento?.queryString ?? ""
}

describe("ResumenBandeja", () => {
  it("muestra cuántas hay por grupo y filtra la tabla al elegir uno", async () => {
    const { usuario, alActualizar } = renderizar("?pagina=3")
    const abiertas = screen.getByRole("button", { name: "Abiertas: 3" })
    expect(abiertas).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Cerradas: 41" })).toBeVisible()

    await usuario.click(abiertas)
    expect(ultimaUrl(alActualizar)).toBe("?estado=abiertas")
    expect(abiertas).toHaveAttribute("aria-pressed", "true")
  })

  it("elegir otra vez el grupo activo quita el filtro", async () => {
    const { usuario, alActualizar } = renderizar("?estado=en_revision")
    const enRevision = screen.getByRole("button", { name: "En revisión: 2" })
    expect(enRevision).toHaveAttribute("aria-pressed", "true")
    await usuario.click(enRevision)
    expect(ultimaUrl(alActualizar)).toBe("")
  })
})
