import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { FranjaSeguidores } from "@/features/cuentas-medio/tipos"
import { exito } from "@/lib/result"

import type { VerificacionEnCola } from "../tipos"

const acciones = vi.hoisted(() => ({
  aprobarVerificacionCuenta: vi.fn(),
  rechazarVerificacionCuenta: vi.fn(),
  comprobarCodigoHistoria: vi.fn(),
  firmarCaptura: vi.fn(),
}))
vi.mock("../actions", () => acciones)

import { HojaCuenta } from "./revision-cuenta"

const FRANJAS: FranjaSeguidores[] = [
  {
    id: "f1",
    clave: "F1",
    nombre: "F1",
    seguidoresMin: 30_000,
    seguidoresMax: 59_999,
  },
  {
    id: "f2",
    clave: "F2",
    nombre: "F2",
    seguidoresMin: 60_000,
    seguidoresMax: 119_999,
  },
  {
    id: "f3",
    clave: "F3",
    nombre: "F3",
    seguidoresMin: 120_000,
    seguidoresMax: null,
  },
]

const VERIFICACION: VerificacionEnCola = {
  id: "0192f3a4-5b6c-7d8e-9f01-000000000101",
  metodo: "CODIGO_HISTORIA",
  seguidoresReportados: 45_000,
  creadaAt: "2026-10-22T14:00:00.000Z",
  actualizadaAt: "2026-10-22T14:10:00.000Z",
  codigoExpiraAt: "2026-10-22T14:30:00.000Z",
  mimeCaptura: "image/webp",
  cuenta: {
    id: "0192f3a4-5b6c-7d8e-9f01-000000000201",
    plataforma: "INSTAGRAM",
    handle: "radio.pasto",
    url: "https://www.instagram.com/radio.pasto",
    seguidoresVerificados: 40_000,
    ultimaVerificacionAt: "2026-04-01T15:00:00.000Z",
  },
  medio: { id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa", nombre: "Radio Pasto" },
}

function renderizar(verificacion = VERIFICACION) {
  const usuario = userEvent.setup()
  const onDecidido = vi.fn()
  render(
    <HojaCuenta
      verificacion={verificacion}
      franjas={FRANJAS}
      abierta
      onAbiertaChange={() => {}}
      onDecidido={onDecidido}
    />
  )
  return { usuario, onDecidido }
}

beforeEach(() => {
  acciones.aprobarVerificacionCuenta.mockReset().mockResolvedValue(exito())
  acciones.rechazarVerificacionCuenta.mockReset().mockResolvedValue(exito())
  acciones.comprobarCodigoHistoria
    .mockReset()
    .mockResolvedValue(exito({ coincide: true }))
  // Sin URL la captura muestra su error; aquí no importa.
  acciones.firmarCaptura
    .mockReset()
    .mockResolvedValue({ ok: false, error: "Sin archivo en la prueba." })
})

describe("HojaCuenta", () => {
  it("propone los seguidores reportados con su franja y su variación", () => {
    renderizar()
    expect(
      screen.getByRole("dialog", { name: "Verificar Instagram @radio.pasto" })
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Seguidores verificados")).toHaveValue(
      "45.000"
    )
    expect(screen.getByText(/Queda en la franja/)).toHaveTextContent(
      "Queda en la franja F1 (30.000–59.999 seguidores)."
    )
    expect(
      screen.getByText(/frente a la verificación anterior/)
    ).toHaveTextContent("Sube 13% frente a la verificación anterior (40.000).")
    expect(
      screen.getByText(/antes de que venciera el código/)
    ).toHaveTextContent(
      "Captura cargada 20 min antes de que venciera el código."
    )
  })

  it("avisa un salto brusco y la franja nueva al cambiar la cifra", async () => {
    const { usuario } = renderizar()
    const campo = screen.getByLabelText("Seguidores verificados")
    await usuario.clear(campo)
    await usuario.type(campo, "80000")
    expect(screen.getByText(/Queda en la franja/)).toHaveTextContent("F2")
    expect(screen.getByText(/cambio brusco/)).toBeInTheDocument()
  })

  it("compara el código de la historia sin mostrar el guardado", async () => {
    const { usuario } = renderizar()
    await usuario.type(screen.getByLabelText("Código en la historia"), "k7p4xq")
    await usuario.click(screen.getByRole("button", { name: "Comprobar" }))
    expect(
      await screen.findByText(/coincide con el código generado/)
    ).toBeInTheDocument()
    expect(acciones.comprobarCodigoHistoria).toHaveBeenCalledWith({
      verificacionId: VERIFICACION.id,
      codigo: "k7p4xq",
    })
  })

  it("aprueba con la cifra escrita", async () => {
    const { usuario, onDecidido } = renderizar()
    const campo = screen.getByLabelText("Seguidores verificados")
    await usuario.clear(campo)
    await usuario.type(campo, "44.800")
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(onDecidido).toHaveBeenCalledOnce())
    expect(acciones.aprobarVerificacionCuenta).toHaveBeenCalledWith({
      verificacionId: VERIFICACION.id,
      seguidoresVerificados: 44_800,
      observaciones: "",
    })
  })

  it("una cifra ilegible no se envía", async () => {
    const { usuario } = renderizar()
    const campo = screen.getByLabelText("Seguidores verificados")
    await usuario.clear(campo)
    await usuario.type(campo, "muchos")
    await usuario.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(
      await screen.findByText("Escribe los seguidores verificados.")
    ).toBeInTheDocument()
    expect(acciones.aprobarVerificacionCuenta).not.toHaveBeenCalled()
  })

  it("con la captura fuera de plazo no deja aprobar, pero sí rechazar", async () => {
    const { usuario, onDecidido } = renderizar({
      ...VERIFICACION,
      actualizadaAt: "2026-10-22T14:45:00.000Z",
    })
    expect(screen.getByText("La captura llegó tarde")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled()

    await usuario.click(screen.getByRole("button", { name: "Rechazar" }))
    const dialogo = screen.getByRole("alertdialog")
    await usuario.click(
      within(dialogo).getByRole("button", {
        name: "La captura no muestra el código temporal completo.",
      })
    )
    await usuario.click(
      within(dialogo).getByRole("button", { name: "Rechazar verificación" })
    )
    await waitFor(() => expect(onDecidido).toHaveBeenCalledOnce())
    expect(acciones.rechazarVerificacionCuenta).toHaveBeenCalledWith({
      verificacionId: VERIFICACION.id,
      motivo: "La captura no muestra el código temporal completo.",
    })
  })

  it("una verificación manual no pide código", () => {
    renderizar({ ...VERIFICACION, metodo: "MANUAL", codigoExpiraAt: null })
    expect(screen.queryByLabelText("Código en la historia")).toBeNull()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })
})
