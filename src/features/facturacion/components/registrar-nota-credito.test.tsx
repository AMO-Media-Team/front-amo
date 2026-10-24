import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

import type { LineaFactura } from "../tipos"

// Las Server Actions no corren en jsdom: espías con lo que respondería la BD.
const acciones = vi.hoisted(() => ({
  prepararArchivoFactura: vi.fn(),
  confirmarArchivoFactura: vi.fn(),
  registrarNotaCredito: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// El PDF ya elegido y subido: la subida real se prueba en su hook.
const archivo = vi.hoisted(() => ({
  elegido: null as File | null,
  lista: null,
  elemento: null,
  activa: false,
  elegir: vi.fn(),
  descartar: vi.fn(),
  reintentar: vi.fn(),
  cancelar: vi.fn(),
  obtener: vi.fn(),
}))
vi.mock("./use-archivo-soporte", () => ({ useArchivoSoporte: () => archivo }))

import { MENSAJES_FACTURACION } from "../errores"
import { RegistrarNotaCredito } from "./registrar-nota-credito"

const FACTURA = "0192f3a4-5b6c-7d8e-9f01-00000000fa01"
const RUTA = `factura/${FACTURA}/0192f3a4-5b6c-7d8e-9f01-0000000000f1.pdf`
/** 23 de octubre de 2026 en Bogotá. */
const AHORA = new Date("2026-10-23T15:00:00.000Z")

function linea(
  asignacionId: string,
  estado: LineaFactura["estado"],
  medio: string
): LineaFactura {
  return {
    asignacionId,
    estado,
    campanaId: "c1",
    campana: "Navidad 2026",
    medioId: `m-${asignacionId}`,
    medio,
    plataforma: "INSTAGRAM",
    oferta: "Reel de lanzamiento",
    montoBruto: 1_000_000,
    montoComision: null,
    montoMedio: null,
    verificadaAt: "2026-10-10T15:00:00Z",
  }
}

const VERIFICADA = "0192f3a4-0000-7000-8000-0000000000c1"
const CANCELADA = "0192f3a4-0000-7000-8000-0000000000c2"
const EN_DISPUTA = "0192f3a4-0000-7000-8000-0000000000c3"

const LINEAS = [
  linea(VERIFICADA, "VERIFICADA", "Radio Pasto"),
  linea(CANCELADA, "CANCELADA", "Pasto Hoy"),
  linea(EN_DISPUTA, "EN_DISPUTA", "Nariño Noticias"),
]

function pintar(lineas: readonly LineaFactura[] = LINEAS) {
  return render(
    <RegistrarNotaCredito
      facturaId={FACTURA}
      numero="FE1042"
      anunciante="Tienda La 14"
      saldo={3_570_000}
      pagado={0}
      fechaEmision="2026-10-15"
      lineas={lineas}
    />
  )
}

async function abrir() {
  const usuario = userEvent.setup()
  await usuario.click(
    screen.getByRole("button", { name: "Registrar nota crédito" })
  )
  const dialogo = await screen.findByRole("dialog", {
    name: "Registrar nota crédito",
  })
  return { usuario, dialogo }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  archivo.elegido = new File(["%PDF"], "nota.pdf", {
    type: "application/pdf",
  })
  archivo.obtener.mockResolvedValue({ ok: true, ruta: RUTA })
  acciones.registrarNotaCredito.mockResolvedValue(
    exito({ estado: "EMITIDA", saldo: 3_470_000 })
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe("RegistrarNotaCredito", () => {
  it("solo ofrece sacar de la factura las asignaciones canceladas, ya marcadas (D88)", async () => {
    pintar()
    const { dialogo } = await abrir()
    const casillas = within(dialogo).getAllByRole("checkbox")
    expect(casillas).toHaveLength(1)
    expect(casillas[0]).toHaveAccessibleName(/Pasto Hoy/)
    expect(casillas[0]).toBeChecked()
    expect(within(dialogo).queryByText("Radio Pasto")).toBeNull()
    expect(within(dialogo).queryByText("Nariño Noticias")).toBeNull()
    expect(
      within(dialogo).getByRole("group", {
        name: /Asignaciones canceladas que salen de la factura/,
      })
    ).toHaveAccessibleDescription(/Solo se ofrecen las canceladas/)
  })

  it("sin canceladas no hay lista que marcar", async () => {
    pintar([LINEAS[0], LINEAS[2]])
    const { dialogo } = await abrir()
    expect(within(dialogo).queryAllByRole("checkbox")).toHaveLength(0)
  })

  it("si el servidor rechaza la lista, el foco llega a la primera casilla al terminar", async () => {
    acciones.registrarNotaCredito.mockResolvedValue(
      fallo(MENSAJES_FACTURACION.soloCanceladas, {
        asignacionIds: [MENSAJES_FACTURACION.soloCanceladas],
      })
    )
    pintar()
    const { usuario, dialogo } = await abrir()
    await usuario.type(within(dialogo).getByLabelText("Número"), "NC125")
    await usuario.type(within(dialogo).getByLabelText("CUDE"), "ab".repeat(48))
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Valor" }),
      "100000"
    )
    await usuario.type(
      within(dialogo).getByRole("textbox", { name: "Motivo" }),
      "Descuento por la publicación cancelada."
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Registrar nota crédito" })
    )

    await waitFor(() =>
      expect(acciones.registrarNotaCredito).toHaveBeenCalledWith(
        expect.objectContaining({
          facturaId: FACTURA,
          asignacionIds: [CANCELADA],
          archivoPath: RUTA,
        })
      )
    )
    const casilla = within(dialogo).getByRole("checkbox")
    await waitFor(() => expect(casilla).toHaveFocus())
    expect(
      within(dialogo).getByText(MENSAJES_FACTURACION.soloCanceladas)
    ).toBeVisible()
  })
})
