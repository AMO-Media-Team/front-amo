import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  generarArchivoPagos: vi.fn(),
  descargarArchivoPagos: vi.fn(),
}))
vi.mock("../actions", () => acciones)
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

import { MENSAJES_PAGOS } from "../errores"
import type { PedidoArchivo } from "../tipos"
import { BotonArchivoPagos } from "./boton-archivo-pagos"
import { DialogoArchivoPagos } from "./dialogo-archivo-pagos"

const A = "0199f3a0-0000-7000-8000-00000000a501"
const B = "0199f3a0-0000-7000-8000-00000000a502"
const DISPERSION = "0199f3a0-0000-7000-8000-0000000000d1"

const PEDIDO: PedidoArchivo = {
  ids: [A, B],
  total: 1_011_002,
  medios: 2,
  excluidas: [{ id: "x", medio: "La Voz", motivo: "sin_datos_pago" }],
  yaEnArchivo: [],
  recortado: false,
}

const GENERADO = {
  tipo: "generado" as const,
  dispersionId: DISPERSION,
  cantidad: 2,
  medios: 2,
  total: 1_011_002,
  nombreArchivo: "archivo-pagos-2026-10-23.csv",
  url: "https://storage.test/firmada",
  avisoDescarga: null,
}

const asignar = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("location", { ...window.location, assign: asignar })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("DialogoArchivoPagos", () => {
  it("resume lo que irá en el archivo y lo que queda por fuera", () => {
    render(<DialogoArchivoPagos pedido={PEDIDO} onCerrar={vi.fn()} />)
    const dialogo = screen.getByRole("alertdialog", {
      name: "¿Generar el archivo de pagos?",
    })
    expect(dialogo).toHaveAccessibleDescription(
      /^2 liquidaciones de 2 medios por .*1\.011\.002\. El archivo revela los datos bancarios/
    )
    expect(
      within(dialogo).getByText(/Quedan por fuera 1 liquidación/)
    ).toBeVisible()
    expect(within(dialogo).getByText("La Voz")).toBeVisible()
    expect(
      within(dialogo).getByText("· Datos de pago incompletos")
    ).toBeVisible()
  })

  it("genera, descarga solo y muestra el resultado con el foco en su título", async () => {
    acciones.generarArchivoPagos.mockResolvedValue(exito(GENERADO))
    const onCerrar = vi.fn()
    const usuario = userEvent.setup()
    render(<DialogoArchivoPagos pedido={PEDIDO} onCerrar={onCerrar} />)
    await usuario.click(screen.getByRole("button", { name: "Generar archivo" }))

    expect(acciones.generarArchivoPagos).toHaveBeenCalledWith({
      liquidacionIds: [A, B],
      repetir: false,
    })
    const titulo = await screen.findByRole("heading", {
      name: "Archivo de pagos generado",
    })
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(asignar).toHaveBeenCalledWith("https://storage.test/firmada")
    expect(avisos.success).toHaveBeenCalled()
    expect(
      screen.getByRole("link", { name: "Ver el archivo" })
    ).toHaveAttribute("href", `/finanzas/pagos/${DISPERSION}`)

    acciones.descargarArchivoPagos.mockResolvedValue(
      exito({ url: "https://storage.test/otra", vigenciaSegundos: 300 })
    )
    await usuario.click(
      screen.getByRole("button", { name: "Descargar otra vez" })
    )
    await waitFor(() =>
      expect(asignar).toHaveBeenLastCalledWith("https://storage.test/otra")
    )
    expect(acciones.descargarArchivoPagos).toHaveBeenCalledWith({
      dispersionId: DISPERSION,
    })

    await usuario.click(screen.getByRole("button", { name: "Listo" }))
    expect(onCerrar).toHaveBeenCalledWith(true)
  })

  it("si alguna ya está en otro archivo, pide confirmarlo con tesorería y repite", async () => {
    acciones.generarArchivoPagos.mockResolvedValue(exito(GENERADO))
    const usuario = userEvent.setup()
    render(
      <DialogoArchivoPagos
        pedido={{
          ...PEDIDO,
          excluidas: [],
          yaEnArchivo: [
            {
              id: B,
              medio: "Radio Pasto",
              dispersadaAt: "2026-10-18T17:14:34Z",
            },
          ],
        }}
        onCerrar={vi.fn()}
      />
    )
    expect(
      screen.getByText(
        "Una ya está en el archivo de pagos del 18 oct 2026: confirma con tesorería que el banco no la pagó antes de incluirla otra vez."
      )
    ).toBeVisible()
    await usuario.click(
      screen.getByRole("button", { name: "Incluirlas otra vez" })
    )
    expect(acciones.generarArchivoPagos).toHaveBeenCalledWith({
      liquidacionIds: [A, B],
      repetir: true,
    })
  })

  it("si el servidor encuentra alguna ya incluida, ofrece «Incluirlas otra vez»", async () => {
    acciones.generarArchivoPagos
      .mockResolvedValueOnce(
        exito({
          tipo: "ya_dispersada",
          mensaje: "Alguna ya está en un archivo.",
        })
      )
      .mockResolvedValueOnce(exito(GENERADO))
    const usuario = userEvent.setup()
    render(<DialogoArchivoPagos pedido={PEDIDO} onCerrar={vi.fn()} />)
    await usuario.click(screen.getByRole("button", { name: "Generar archivo" }))
    expect(
      await screen.findByRole("alertdialog", { name: "¿Incluirlas otra vez?" })
    ).toHaveTextContent("Alguna ya está en un archivo.")
    await usuario.click(
      screen.getByRole("button", { name: "Incluirlas otra vez" })
    )
    expect(acciones.generarArchivoPagos).toHaveBeenLastCalledWith({
      liquidacionIds: [A, B],
      repetir: true,
    })
  })

  it("un fallo se muestra dentro y el diálogo sigue abierto", async () => {
    acciones.generarArchivoPagos.mockResolvedValue(
      fallo("Documento soporte requerido: falta el documento de: La Voz.")
    )
    const usuario = userEvent.setup()
    render(<DialogoArchivoPagos pedido={PEDIDO} onCerrar={vi.fn()} />)
    await usuario.click(screen.getByRole("button", { name: "Generar archivo" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^Documento soporte requerido: /
    )
    expect(asignar).not.toHaveBeenCalled()
  })

  it("sin nada que se pueda pagar, no deja generar", () => {
    render(
      <DialogoArchivoPagos
        pedido={{ ...PEDIDO, ids: [], total: 0, medios: 0 }}
        onCerrar={vi.fn()}
      />
    )
    expect(
      screen.getByRole("button", { name: "Generar archivo" })
    ).toBeDisabled()
  })
})

describe("BotonArchivoPagos", () => {
  it("sin «Ver datos sensibles» lo explica antes de llamar", async () => {
    const onClick = vi.fn()
    const usuario = userEvent.setup()
    render(
      <BotonArchivoPagos puedeVerDatosSensibles={false} onClick={onClick} />
    )
    const boton = screen.getByRole("button", {
      name: "Generar archivo de pagos",
    })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription(MENSAJES_PAGOS.sinDatosSensibles)
    await usuario.click(boton)
    expect(onClick).not.toHaveBeenCalled()
  })
})
