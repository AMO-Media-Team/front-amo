import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { INSTANTANEA_INICIAL } from "@/components/archivos/motor-subida"
import { exito } from "@/lib/result"

const acciones = vi.hoisted(() => ({
  generarCodigoVerificacion: vi.fn(),
  prepararCaptura: vi.fn(),
  enviarCapturaCodigo: vi.fn(),
  enviarVerificacionManual: vi.fn(),
}))
vi.mock("../actions", () => acciones)
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { estadoCuenta } from "../estado-cuenta"
import type {
  CodigoGenerado,
  FranjaSeguidores,
  ParametrosVerificacion,
  VerificacionCuentaMedio,
} from "../tipos"
import { HojaVerificacion } from "./hoja-verificacion"
import type { CargaCaptura } from "./use-carga-captura"

const AHORA = new Date("2026-10-22T15:00:00Z")

const PARAMETROS: ParametrosVerificacion = {
  diasVigencia: 30,
  diasGracia: 7,
  minutosCodigo: 60,
  umbralSeguidores: 30_000,
}

const FRANJAS: FranjaSeguidores[] = [
  {
    id: "f1",
    clave: "F1",
    nombre: "30.000 – 60.000",
    seguidoresMin: 30_000,
    seguidoresMax: 60_000,
  },
]

const CODIGO: CodigoGenerado = {
  verificacionId: "v-nueva",
  codigo: "K7P4XQ",
  expiraAt: "2026-10-22T16:00:00Z",
}

function cargaFalsa(elegida: File | null = null): CargaCaptura {
  return {
    subida: {
      ...INSTANTANEA_INICIAL,
      subir: vi.fn(),
      reintentar: vi.fn(),
      cancelar: vi.fn(),
      reiniciar: vi.fn(),
      activa: false,
    },
    elegida,
    vistaPrevia: null,
    elemento: null,
    elegir: vi.fn(),
    enviar: vi.fn().mockResolvedValue(true),
    reintentar: vi.fn(),
    descartar: vi.fn(),
  }
}

function Escenario({
  verificaciones = [],
  carga,
  ahora = AHORA,
}: {
  verificaciones?: VerificacionCuentaMedio[]
  carga: CargaCaptura
  /** Instante con que la página calcula el estado (avanza cada 30 s). */
  ahora?: Date
}) {
  // El código vive en la tarjeta (memoria de la visita), no en la hoja.
  const [codigo, setCodigo] = useState<CodigoGenerado | null>(null)
  const cuenta = {
    id: "cuenta-1",
    plataforma: "INSTAGRAM" as const,
    handle: "radiopasto",
    verificada: false,
    ultimaVerificacionAt: null,
    verificaciones,
  }
  return (
    <HojaVerificacion
      abierta
      onAbiertaChange={vi.fn()}
      cuenta={cuenta}
      estado={estadoCuenta(cuenta, PARAMETROS, ahora)}
      franjas={FRANJAS}
      parametros={PARAMETROS}
      carga={carga}
      codigo={codigo}
      onCodigo={setCodigo}
    />
  )
}

const CODIGO_SIN_CAPTURA: VerificacionCuentaMedio = {
  id: "v-1",
  metodo: "CODIGO_HISTORIA",
  estado: "PENDIENTE",
  seguidoresReportados: 41_000,
  seguidoresVerificados: null,
  tieneCaptura: false,
  capturaTipo: null,
  codigoExpiraAt: "2026-10-22T15:40:00Z",
  observaciones: null,
  creadaAt: "2026-10-22T14:40:00Z",
  validadaAt: null,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  for (const accion of Object.values(acciones)) accion.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("HojaVerificacion", () => {
  it("empieza eligiendo el método; el código es la opción recomendada", () => {
    render(<Escenario carga={cargaFalsa()} />)
    const hoja = screen.getByRole("dialog", { name: "Verificar la cuenta" })
    expect(
      within(hoja).getByText("Instagram · @radiopasto")
    ).toBeInTheDocument()
    expect(
      within(hoja).getByRole("radio", { name: /Código en una historia/ })
    ).toBeChecked()
    expect(within(hoja).getByText("Más rápida")).toBeInTheDocument()
    expect(within(hoja).getByText(/Tienes 60 minutos/)).toBeInTheDocument()
  })

  it("pide los seguidores, genera el código y lo muestra una sola vez", async () => {
    const usuario = userEvent.setup()
    acciones.generarCodigoVerificacion.mockResolvedValue(exito(CODIGO))
    render(<Escenario carga={cargaFalsa()} />)

    await usuario.click(screen.getByRole("button", { name: /Continuar/ }))
    expect(
      screen.getByRole("dialog", { name: "Código para tu historia" })
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole("button", { name: /Generar código/ }))
    expect(
      await screen.findByText("Escribe cuántos seguidores tiene hoy la cuenta.")
    ).toBeInTheDocument()
    expect(acciones.generarCodigoVerificacion).not.toHaveBeenCalled()

    const campo = screen.getByLabelText("Seguidores que tiene hoy la cuenta")
    await usuario.type(campo, "12.000")
    expect(campo).toHaveAccessibleDescription(/menos de 30\.000 seguidores/)
    await usuario.clear(campo)
    await usuario.type(campo, "45.000")
    expect(campo).toHaveAccessibleDescription(/franja 30\.000 – 60\.000/)

    await usuario.click(screen.getByRole("button", { name: /Generar código/ }))
    await waitFor(() =>
      expect(acciones.generarCodigoVerificacion).toHaveBeenCalledWith({
        cuentaId: "cuenta-1",
        seguidores: "45.000",
      })
    )
    const codigo = await screen.findByRole("region", {
      name: "Tu código de verificación",
    })
    expect(within(codigo).getByText("K7P 4XQ")).toBeInTheDocument()
    expect(within(codigo).getByText("K, 7, P, 4, X, Q")).toHaveClass("sr-only")
    expect(screen.getByText(/solo lo mostramos ahora/)).toBeInTheDocument()
    expect(
      screen.getByRole("dialog", {
        name: "Publica el código y envía la captura",
      })
    ).toBeInTheDocument()
  })

  it("con un código pendiente que ya no está en pantalla, explica que use el que recibió", () => {
    render(
      <Escenario carga={cargaFalsa()} verificaciones={[CODIGO_SIN_CAPTURA]} />
    )
    expect(screen.getByText("Usa el código que te dimos")).toBeInTheDocument()
    expect(
      screen.queryByRole("region", { name: "Tu código de verificación" })
    ).toBeNull()
    expect(
      screen.getByRole("button", { name: /Pedir un código nuevo/ })
    ).toBeInTheDocument()
  })

  it("si el código vence con la hoja abierta, ofrece pedir otro", () => {
    const { rerender } = render(
      <Escenario carga={cargaFalsa()} verificaciones={[CODIGO_SIN_CAPTURA]} />
    )
    expect(
      screen.getByRole("button", { name: "Enviar captura" })
    ).toBeInTheDocument()
    rerender(
      <Escenario
        carga={cargaFalsa()}
        verificaciones={[CODIGO_SIN_CAPTURA]}
        ahora={new Date("2026-10-22T15:41:00Z")}
      />
    )
    expect(screen.getByText("El código venció")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enviar captura" })).toBeNull()
    expect(
      screen.getAllByRole("button", { name: /Pedir un código nuevo/ })
    ).toHaveLength(1)
  })

  it("envía la captura del código a su verificación", async () => {
    const usuario = userEvent.setup()
    const captura = new File(["x"], "historia.png", { type: "image/png" })
    const carga = cargaFalsa(captura)
    render(<Escenario carga={carga} />)
    await usuario.click(screen.getByRole("button", { name: /Continuar/ }))
    acciones.generarCodigoVerificacion.mockResolvedValue(exito(CODIGO))
    await usuario.type(
      screen.getByLabelText("Seguidores que tiene hoy la cuenta"),
      "45000"
    )
    await usuario.click(screen.getByRole("button", { name: /Generar código/ }))
    await usuario.click(
      await screen.findByRole("button", { name: /Enviar captura/ })
    )
    expect(carga.enviar).toHaveBeenCalledWith({
      metodo: "CODIGO_HISTORIA",
      verificacionId: "v-nueva",
    })
  })

  it("estadísticas: exige la captura y envía los seguidores escritos", async () => {
    const usuario = userEvent.setup()
    const sinCaptura = cargaFalsa()
    const { unmount } = render(<Escenario carga={sinCaptura} />)
    await usuario.click(
      screen.getByRole("radio", { name: /Captura de estadísticas/ })
    )
    await usuario.click(screen.getByRole("button", { name: /Continuar/ }))
    expect(screen.getByText(/Panel profesional/)).toBeInTheDocument()
    await usuario.click(
      screen.getByRole("button", { name: /Enviar verificación/ })
    )
    expect(
      await screen.findByText("Elige la captura de tus estadísticas.")
    ).toBeInTheDocument()
    expect(sinCaptura.enviar).not.toHaveBeenCalled()
    unmount()

    const conCaptura = cargaFalsa(
      new File(["x"], "panel.png", { type: "image/png" })
    )
    render(<Escenario carga={conCaptura} />)
    await usuario.click(
      screen.getByRole("radio", { name: /Captura de estadísticas/ })
    )
    await usuario.click(screen.getByRole("button", { name: /Continuar/ }))
    await usuario.type(
      screen.getByLabelText("Seguidores que muestra la captura"),
      "52.300"
    )
    await usuario.click(
      screen.getByRole("button", { name: /Enviar verificación/ })
    )
    expect(conCaptura.enviar).toHaveBeenCalledWith({
      metodo: "MANUAL",
      seguidores: "52.300",
    })
  })

  it("«Atrás» vuelve a la elección del método", async () => {
    const usuario = userEvent.setup()
    render(<Escenario carga={cargaFalsa()} />)
    await usuario.click(screen.getByRole("button", { name: /Continuar/ }))
    await usuario.click(screen.getByRole("button", { name: "Atrás" }))
    expect(
      screen.getByRole("dialog", { name: "Verificar la cuenta" })
    ).toBeInTheDocument()
  })
})
