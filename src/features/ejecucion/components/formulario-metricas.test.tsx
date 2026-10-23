import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ArchivoSubido } from "@/lib/archivos/tipos"
import { exito, fallo } from "@/lib/result"

import { VALORES_VACIOS } from "../campos-metricas"
import type {
  AsignacionEjecucion,
  MetricaEjecucion,
  PublicacionEjecucion,
} from "../tipos"

const acciones = vi.hoisted(() => ({
  guardarMetricas: vi.fn(),
  prepararCapturaEjecucion: vi.fn(),
  confirmarCapturaEjecucion: vi.fn(),
  firmarCapturaPublicacion: vi.fn(),
  firmarCapturaMetrica: vi.fn(),
}))
vi.mock("../actions", () => acciones)

const navegacion = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navegacion }))

const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))

const carga = vi.hoisted(() => ({
  subida: { activa: false, cancelar: () => {} },
  elegida: null as File | null,
  vistaPrevia: null,
  lista: null,
  elemento: null,
  elegir: () => {},
  descartar: () => {},
  reintentar: () => {},
  obtener: vi.fn(),
}))
vi.mock("@/components/archivos/use-carga-captura", () => ({
  useCargaCaptura: () => carga,
}))

import { FormularioMetricas } from "./formulario-metricas"

const ID = "01a16692-e9e2-7fb6-9d68-1041425b1b76"
// Publicada a las 2:00 p. m. del 21 de octubre (Bogotá).
const PUBLICADA = "2026-10-21T19:00:00.000Z"
// 3:00 p. m. del 23 de octubre: ya pasó el corte de 24 h.
const AHORA_H24 = new Date("2026-10-23T20:00:00.000Z")
// 4:00 p. m. del 28 de octubre: ya pasó el de 7 días.
const AHORA_D7 = new Date("2026-10-28T21:00:00.000Z")

const ASIGNACION: AsignacionEjecucion = {
  id: ID,
  estado: "EVIDENCIA_VALIDADA",
  plataforma: "INSTAGRAM",
  formatoClave: "REEL",
  formatoNombre: "Reel",
  ofertaTitulo: "Lanzamiento de temporada",
  marca: "Café del Huila",
  handle: "noticias.pasto",
  publicaciones: 1,
  ventanaInicio: "2026-10-20T05:00:00.000Z",
  ventanaFin: "2026-10-30T04:59:00.000Z",
  contenidoDescargadoAt: "2026-10-20T14:00:00.000Z",
  fechaLimitePublicacion: "2026-10-30T04:59:00.000Z",
  cortesRequeridos: ["H24", "H72", "D7"],
  permanenciaMinimaDias: 7,
  reclamoHasta: null,
}

const PUBLICACION: PublicacionEjecucion = {
  id: "01a16692-e9e2-7d5b-9d80-41819e555927",
  numero: 1,
  urlPost: "https://www.instagram.com/reel/C9AbCdEfGhI",
  fechaPublicacion: PUBLICADA,
  estado: "APROBADA",
  observaciones: null,
  conMiniatura: true,
  actualizadaAt: PUBLICADA,
}

function metrica(cambios: Partial<MetricaEjecucion>): MetricaEjecucion {
  return {
    id: "01a16692-e9e2-77de-bcbf-c3e273214fe1",
    corte: "H72",
    fechaCorte: "2026-10-24T20:00:00.000Z",
    periodoDesde: null,
    periodoHasta: null,
    valores: {
      ...VALORES_VACIOS,
      alcance: 1500,
      impresiones: 2400,
      reproducciones: 3000,
      meGusta: 150,
      comentarios: 10,
      compartidos: 10,
      guardados: 10,
    },
    estado: "PENDIENTE",
    observaciones: null,
    conMiniatura: true,
    ...cambios,
  }
}

const CAPTURA: ArchivoSubido = {
  nombre: "panel.png",
  tipo: "image/webp",
  tamano: 2048,
  sha256: null,
  dimensiones: null,
  duracionSeg: null,
  conMiniatura: true,
  bucket: "evidencias",
  ruta: `asignacion/${ID}/metrica/x.webp`,
  rutaMiniatura: `asignacion/${ID}/metrica/x-min.webp`,
}

function renderizar(
  props: Partial<Parameters<typeof FormularioMetricas>[0]> = {},
  ahora: Date = AHORA_H24
) {
  vi.setSystemTime(ahora)
  return render(
    <FormularioMetricas
      asignacion={ASIGNACION}
      numero={1}
      publicacion={PUBLICACION}
      corte="H24"
      metrica={null}
      otros={[]}
      toleranciaCortes={0.02}
      plazoCargaHoras={48}
      modo="cargar"
      ahoraServidor={ahora.getTime()}
      {...props}
    />
  )
}

const usuario = () => userEvent.setup()

async function escribir(etiqueta: string | RegExp, valor: string) {
  const campo = screen.getByLabelText(etiqueta)
  await usuario().clear(campo)
  await usuario().type(campo, valor)
}

async function llenarInstagram(cambios: Record<string, string> = {}) {
  const valores: Record<string, string> = {
    Alcance: "1.200",
    Impresiones: "2.500",
    Reproducciones: "3.100",
    "Me gusta": "150",
    Comentarios: "12",
    Guardados: "20",
    Compartidos: "8",
    ...cambios,
  }
  for (const [etiqueta, valor] of Object.entries(valores)) {
    await escribir(etiqueta, valor)
  }
}

function enviar(nombre = "Enviar métricas") {
  return usuario().click(screen.getByRole("button", { name: nombre }))
}

const desplazar = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  // jsdom no implementa el desplazamiento.
  desplazar.mockReset()
  Element.prototype.scrollIntoView = desplazar
  for (const accion of Object.values(acciones)) accion.mockReset()
  acciones.firmarCapturaMetrica.mockResolvedValue(fallo("sin red"))
  navegacion.push.mockReset()
  avisos.success.mockReset()
  carga.elegida = null
  carga.obtener.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("FormularioMetricas (MED-014)", () => {
  it("pide en Instagram los campos de EP §9 (reproducciones del reel incluidas)", () => {
    renderizar()
    for (const etiqueta of [
      "Alcance",
      "Impresiones",
      "Reproducciones",
      "Me gusta",
      "Comentarios",
      "Guardados",
      "Compartidos",
      /^Visitas al perfil/,
      /^Clics en el enlace/,
    ]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument()
    }
    expect(screen.queryByLabelText("Espectadores únicos")).toBeNull()
  })

  it("pide en TikTok reproducciones, espectadores, tiempo y reproducción completa", () => {
    renderizar({
      asignacion: {
        ...ASIGNACION,
        plataforma: "TIKTOK",
        formatoClave: "VIDEO",
      },
    })
    for (const etiqueta of [
      "Reproducciones",
      "Espectadores únicos",
      "Me gusta",
      "Comentarios",
      "Compartidos",
      "Tiempo promedio de visualización",
      "Reproducción completa",
    ]) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument()
    }
    expect(screen.queryByLabelText("Alcance")).toBeNull()
    expect(screen.queryByLabelText("Impresiones")).toBeNull()
  })

  it("suma las interacciones mientras se escriben", async () => {
    renderizar()
    await escribir("Me gusta", "1.000")
    await escribir("Comentarios", "25")
    const resumen = screen.getByText("Interacciones").closest("div")
    expect(resumen).not.toBeNull()
    expect(
      within(resumen as HTMLElement).getByText("1.025")
    ).toBeInTheDocument()
  })

  it("INT-001: sin captura no se registra", async () => {
    renderizar()
    await llenarInstagram()
    await enviar()
    expect(
      await screen.findByText(
        "Carga la captura del panel de estadísticas, con la fecha visible."
      )
    ).toBeInTheDocument()
    expect(acciones.guardarMetricas).not.toHaveBeenCalled()
  })

  it("INT-005: un corte de 7 días con menos alcance que el de 72 h muestra el error y no se registra", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    renderizar({ corte: "D7", otros: [metrica({ corte: "H72" })] }, AHORA_D7)
    await llenarInstagram({ Alcance: "900" })
    await enviar()
    expect(
      await screen.findByText(
        /^En el corte de 72 horas, el alcance fue 1\.500\. Un corte posterior no puede quedar por debajo/
      )
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Alcance")).toHaveAttribute(
      "aria-invalid",
      "true"
    )
    expect(acciones.guardarMetricas).not.toHaveBeenCalled()
  })

  it("las interacciones no pueden superar las impresiones", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    renderizar()
    await llenarInstagram({ Impresiones: "1.300", "Me gusta": "1.290" })
    await enviar()
    expect(
      await screen.findByText(
        "Las interacciones suman 1.330 y no pueden superar las impresiones (1.300)."
      )
    ).toBeInTheDocument()
    // La suma no es un campo: el foco va al primero que suma, que la cita.
    const meGusta = screen.getByLabelText("Me gusta")
    expect(meGusta).toHaveFocus()
    const error = screen.getByText(/^Las interacciones suman/)
    expect(meGusta.getAttribute("aria-describedby")).toContain(error.id)
    expect(acciones.guardarMetricas).not.toHaveBeenCalled()
  })

  it("guarda el corte con su captura y, si era el último, lo celebra", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    acciones.guardarMetricas.mockResolvedValue(
      exito({ metricaId: "m", estadoAsignacion: "METRICAS_CARGADAS" })
    )
    renderizar()
    await llenarInstagram()
    await enviar()
    await waitFor(() =>
      expect(acciones.guardarMetricas).toHaveBeenCalledWith(
        expect.objectContaining({
          asignacionId: ID,
          numero: 1,
          corte: "H24",
          metricaId: null,
          dia: "2026-10-23",
          hora: "15:00",
          alcance: "1.200",
          impresiones: "2.500",
          captura: CAPTURA,
        })
      )
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "¡Listo! Cargaste todas las métricas. El equipo AMO las verificará."
    )
    expect(navegacion.push).toHaveBeenCalledWith(`/mis-campanas/${ID}`)
  })

  it("corrige una rechazada con sus observaciones y conserva la captura", async () => {
    acciones.guardarMetricas.mockResolvedValue(
      exito({ metricaId: "m", estadoAsignacion: "EVIDENCIA_VALIDADA" })
    )
    const rechazada = metrica({
      corte: "H24",
      fechaCorte: "2026-10-22T20:00:00.000Z",
      estado: "RECHAZADA",
      observaciones: "La captura no coincide con las cifras.",
    })
    renderizar({ metrica: rechazada, modo: "corregir" })
    expect(
      screen.getByText("La captura no coincide con las cifras.")
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Alcance")).toHaveValue("1.500")
    await escribir("Alcance", "1.550")
    await enviar("Enviar la corrección")
    await waitFor(() =>
      expect(acciones.guardarMetricas).toHaveBeenCalledWith(
        expect.objectContaining({ alcance: "1.550", captura: null })
      )
    )
    expect(avisos.success).toHaveBeenCalledWith(
      "Enviaste las métricas de 24 horas. El equipo AMO las revisará."
    )
  })

  it("una rechazada reenviada sin cambios no se envía: pide cambiar algo (C2)", async () => {
    const rechazada = metrica({
      corte: "H24",
      fechaCorte: "2026-10-22T20:00:00.000Z",
      estado: "RECHAZADA",
      observaciones: "La captura no coincide con las cifras.",
    })
    renderizar({ metrica: rechazada, modo: "corregir" })
    await enviar("Enviar la corrección")
    const alerta = await screen.findByText(
      "Cambia alguna cifra, la fecha o la captura para enviar la corrección."
    )
    expect(alerta.closest("[role=alert]")).not.toBeNull()
    expect(acciones.guardarMetricas).not.toHaveBeenCalled()
    expect(avisos.success).not.toHaveBeenCalled()
    // Con una captura nueva sí es una corrección.
    acciones.guardarMetricas.mockResolvedValue(
      exito({ metricaId: "m", estadoAsignacion: "EVIDENCIA_VALIDADA" })
    )
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    await enviar("Enviar la corrección")
    await waitFor(() =>
      expect(acciones.guardarMetricas).toHaveBeenCalledWith(
        expect.objectContaining({ captura: CAPTURA })
      )
    )
  })

  it("el personalizado pide el periodo y empieza el día de la publicación", () => {
    renderizar({ corte: "PERSONALIZADO" })
    expect(
      screen.getByRole("heading", { name: "Periodo que reportas" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Desde/ })).toHaveTextContent(
      /21/
    )
    expect(screen.getByText("Corte personalizado")).toBeInTheDocument()
  })

  it("un error de campo de la BD recibe el foco y queda a la vista al terminar el envío (U1)", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    const mensaje =
      "La captura es de antes de que se cumpliera el corte. Toma una nueva desde el panel y corrige la fecha."
    acciones.guardarMetricas.mockResolvedValue(
      fallo(mensaje, { hora: [mensaje] })
    )
    renderizar()
    await llenarInstagram()
    await enviar()
    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    const hora = screen.getByLabelText("Hora")
    await waitFor(() => expect(hora).toHaveFocus())
    expect(desplazar.mock.contexts.at(-1)).toBe(hora)
    expect(desplazar).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" })
    )
  })

  it("un error de la BD sin campo se muestra arriba del botón", async () => {
    carga.elegida = new File(["x"], "panel.png", { type: "image/png" })
    carga.obtener.mockResolvedValue({ ok: true, captura: CAPTURA })
    acciones.guardarMetricas.mockResolvedValue(
      fallo("Este corte ya no admite cambios.")
    )
    renderizar()
    await llenarInstagram()
    await enviar()
    const alerta = await screen.findByText("Este corte ya no admite cambios.")
    // Queda a la vista, junto al pie de acciones.
    await waitFor(() =>
      expect(desplazar.mock.contexts.at(-1)).toBe(
        alerta.closest("[data-error-general]")
      )
    )
    expect(navegacion.push).not.toHaveBeenCalled()
  })
})
