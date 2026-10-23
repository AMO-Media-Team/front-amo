import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactNode, useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { exito } from "@/lib/result"

import { moverId } from "../actualizaciones"
import { archivoPrueba, versionPrueba } from "../fixtures"
import type { VersionCreativo } from "../tipos"
import { type Direccion, GaleriaArchivos } from "./galeria-archivos"

vi.mock("../actions", () => ({
  firmarArchivoCreativo: vi.fn(async () =>
    exito({ url: "https://storage.test/x", vigenciaSegundos: 300 })
  ),
  firmarArchivosVersion: vi.fn(async () =>
    exito({ archivos: {}, vigenciaSegundos: 300 })
  ),
}))

function conConsultas(hijo: ReactNode) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={cliente}>{hijo}</QueryClientProvider>
}

const CARRUSEL = versionPrueba({
  tipo: "CARRUSEL",
  archivos: ["a", "b", "c"].map((id, orden) =>
    archivoPrueba({ id, orden, mime: "image/jpeg", ancho: 1080, alto: 1080 })
  ),
})

/** Termina el guardado del orden en curso (lo fija `GaleriaConEstado`). */
let terminarOrden: () => void = () => undefined

/**
 * La galería con el orden en estado, como la caché del panel. Con
 * `guardaOrden`, mover deja `ordenando` hasta `terminarOrden()`, como el
 * editor mientras guarda; quitar borra la pieza y, sin piezas, la galería
 * desaparece (el foco va al título de la sección).
 */
function GaleriaConEstado({
  onMover,
  guardaOrden = false,
  inicial = CARRUSEL,
}: {
  onMover?: () => void
  guardaOrden?: boolean
  inicial?: VersionCreativo
}) {
  const [version, setVersion] = useState<VersionCreativo>(inicial)
  const [ordenando, setOrdenando] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  function mover(indice: number, direccion: Direccion) {
    onMover?.()
    if (guardaOrden) {
      setOrdenando(true)
      terminarOrden = () => setOrdenando(false)
    }
    const ids = moverId(
      version.archivos.map((archivo) => archivo.id),
      indice,
      direccion === "antes" ? indice - 1 : indice + 1
    )
    setVersion({
      ...version,
      archivos: ids.map((id, orden) => ({
        ...(version.archivos.find((archivo) => archivo.id === id) ??
          version.archivos[0]),
        orden,
      })),
    })
  }
  async function quitar(archivo: { id: string }) {
    setVersion((previa) => ({
      ...previa,
      archivos: previa.archivos.filter((actual) => actual.id !== archivo.id),
    }))
    return exito(undefined)
  }
  return (
    <section aria-labelledby="titulo-archivos">
      <h4 id="titulo-archivos" ref={titulo} tabIndex={-1}>
        Archivos
      </h4>
      {version.archivos.length > 0 ? (
        <GaleriaArchivos
          version={version}
          ordenable
          ordenando={ordenando}
          onQuitar={quitar}
          onMover={mover}
          focoSinArchivos={() => titulo.current}
        />
      ) : null}
    </section>
  )
}

describe("GaleriaArchivos", () => {
  it("numera las piezas y no mueve fuera de los bordes", () => {
    render(conConsultas(<GaleriaConEstado />))
    const lista = screen.getByRole("list", { name: "Archivos cargados" })
    expect(within(lista).getAllByRole("listitem")).toHaveLength(3)
    expect(
      screen.getByRole("button", { name: "Mover imagen 1 de 3 antes" })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Mover imagen 3 de 3 después" })
    ).toBeDisabled()
  })

  it("mueve, anuncia la posición y conserva el foco en la pieza", async () => {
    const usuario = userEvent.setup()
    const onMover = vi.fn()
    render(conConsultas(<GaleriaConEstado onMover={onMover} />))
    await usuario.click(
      screen.getByRole("button", { name: "Mover imagen 2 de 3 antes" })
    )
    expect(onMover).toHaveBeenCalledOnce()
    expect(
      screen.getByText("Imagen 2 de 3 pasó a la posición 1 de 3.")
    ).toBeInTheDocument()
    // La pieza llegó al borde: el foco pasa a su otro botón.
    expect(
      screen.getByRole("button", { name: "Mover imagen 1 de 3 después" })
    ).toHaveFocus()
  })

  it("mientras se guarda el orden, el foco sigue en la pieza movida", async () => {
    const usuario = userEvent.setup()
    render(conConsultas(<GaleriaConEstado guardaOrden />))
    await usuario.click(
      screen.getByRole("button", { name: "Mover imagen 2 de 3 después" })
    )
    const despues = screen.getByRole("button", {
      name: "Mover imagen 3 de 3 antes",
    })
    // Guardando: no se puede volver a mover, pero el foco no cae en <body>.
    expect(despues).toHaveFocus()
    expect(despues).toHaveAttribute("aria-disabled", "true")
    await usuario.keyboard("{Enter}")
    expect(
      screen.getByText("Imagen 2 de 3 pasó a la posición 3 de 3.")
    ).toBeInTheDocument()
    act(() => terminarOrden())
    expect(despues).toBeEnabled()
    expect(despues).toHaveFocus()
  })

  it("al quitar, el foco pasa a la pieza vecina y, sin piezas, al título", async () => {
    const usuario = userEvent.setup()
    render(
      conConsultas(
        <GaleriaConEstado
          inicial={{ ...CARRUSEL, archivos: CARRUSEL.archivos.slice(0, 2) }}
        />
      )
    )
    await usuario.click(
      screen.getByRole("button", { name: "Quitar imagen 1 de 2" })
    )
    await usuario.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Quitar",
      })
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Quitar imagen" })
      ).toHaveFocus()
    )
    expect(
      screen.getByText("Archivo quitado: imagen 1 de 2.")
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: "Quitar imagen" }))
    await usuario.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Quitar",
      })
    )
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Archivos" })).toHaveFocus()
    )
  })

  it("si se cancela, el foco vuelve a «Quitar» de la misma pieza", async () => {
    const usuario = userEvent.setup()
    render(conConsultas(<GaleriaConEstado />))
    const quitar = screen.getByRole("button", { name: "Quitar imagen 2 de 3" })
    await usuario.click(quitar)
    await usuario.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancelar",
      })
    )
    await waitFor(() => expect(quitar).toHaveFocus())
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("pide confirmación antes de quitar", async () => {
    const usuario = userEvent.setup()
    render(conConsultas(<GaleriaConEstado />))
    await usuario.click(
      screen.getByRole("button", { name: "Quitar imagen 3 de 3" })
    )
    expect(
      await screen.findByRole("alertdialog", { name: "¿Quitar imagen 3 de 3?" })
    ).toHaveTextContent(
      "Si lo necesitas otra vez tendrás que cargarlo de nuevo."
    )
  })
})
