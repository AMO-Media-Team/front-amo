import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useGuardiaSalida } from "./use-guardia-salida"

function Pagina({
  activa,
  onIntento,
}: {
  activa: boolean
  onIntento: (destino: string) => void
}) {
  useGuardiaSalida(activa, onIntento)
  return (
    <>
      {/* `<Link>` pinta este mismo `<a>`; aquí no hay enrutador de Next. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/operacion/medios?q=radio">Medios</a>
      <a href={`${window.location.pathname}?paso=dos`}>Mismo lugar</a>
      <a href="https://example.com/fuera">Fuera</a>
      <a href="/reportes" target="_blank">
        Nueva pestaña
      </a>
    </>
  )
}

/**
 * Hace las veces del enrutador (fase de burbuja): registra los clics que
 * llegan hasta él y evita la navegación real, que jsdom no implementa.
 */
const enrutador = vi.fn((evento: Event) => evento.preventDefault())

describe("useGuardiaSalida", () => {
  beforeEach(() => {
    enrutador.mockClear()
    document.addEventListener("click", enrutador)
  })
  afterEach(() => {
    document.removeEventListener("click", enrutador)
  })

  it("intercepta los enlaces internos a otra ruta y entrega el destino", () => {
    const onIntento = vi.fn()
    render(<Pagina activa onIntento={onIntento} />)
    fireEvent.click(screen.getByText("Medios"))
    expect(onIntento).toHaveBeenCalledWith("/operacion/medios?q=radio")
    expect(enrutador).not.toHaveBeenCalled()
  })

  it("deja pasar la misma ruta, otros orígenes, pestañas nuevas y clics con modificador", () => {
    const onIntento = vi.fn()
    render(<Pagina activa onIntento={onIntento} />)
    fireEvent.click(screen.getByText("Mismo lugar"))
    fireEvent.click(screen.getByText("Fuera"))
    fireEvent.click(screen.getByText("Nueva pestaña"))
    fireEvent.click(screen.getByText("Medios"), { metaKey: true })
    expect(onIntento).not.toHaveBeenCalled()
    expect(enrutador).toHaveBeenCalledTimes(4)
  })

  it("inactiva no intercepta nada", () => {
    const onIntento = vi.fn()
    render(<Pagina activa={false} onIntento={onIntento} />)
    fireEvent.click(screen.getByText("Medios"))
    expect(onIntento).not.toHaveBeenCalled()
    expect(enrutador).toHaveBeenCalledTimes(1)
  })

  it("activa pide confirmación del navegador al cerrar o recargar", () => {
    render(<Pagina activa onIntento={vi.fn()} />)
    const evento = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(true)
  })
})
