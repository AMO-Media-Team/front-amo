import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { exito, fallo } from "@/lib/result"

// Las Server Actions no corren en jsdom: espías con lo que respondería la BD.
const acciones = vi.hoisted(() => ({
  abrirDisputa: vi.fn(),
  prepararAdjuntoDisputa: vi.fn(),
  confirmarAdjuntoDisputa: vi.fn(),
  enviarMensajeDisputa: vi.fn(),
}))
vi.mock("@/features/disputas/actions", () => acciones)
const enrutador = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => enrutador }))
const avisos = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock("sonner", () => ({ toast: avisos }))
// La subida real (Storage) se prueba en su hook: aquí solo importa que se pida.
const subida = vi.hoisted(() => ({
  subir: vi.fn(),
  cancelar: vi.fn(),
  estado: "inactiva",
  progreso: 0,
  error: null,
  intento: 0,
  reanudaEn: null,
}))
vi.mock("@/components/archivos/use-subida", () => ({
  useSubida: () => subida,
}))

import type { AperturaDisputa } from "../../disputa"
import { PanelDisputa } from "./panel-disputa"

const AHORA = new Date("2026-10-23T15:00:00.000Z")
const ASIGNACION = "0199f3a0-0000-7000-8000-00000000a501"
const DISPUTA = "0199f3a0-0000-7000-8000-0000000000d1"

const RECLAMO: AperturaDisputa = {
  perspectiva: "medio",
  asignacionId: ASIGNACION,
  modo: "reclamo",
  motivos: ["OTRO", "INCUMPLIMIENTO"],
  estadoAsignacion: "VENCIDA_SIN_PUBLICAR",
  reclamoHasta: "2026-10-25T15:00:00.000Z",
  plazoRecargaHoras: 24,
  plataforma: "INSTAGRAM",
  handle: "medioe2e",
}

const PROBLEMA: AperturaDisputa = {
  ...RECLAMO,
  perspectiva: "anunciante",
  modo: "problema",
  motivos: ["INCUMPLIMIENTO", "METRICAS", "CONTENIDO", "PERMANENCIA", "OTRO"],
  estadoAsignacion: "METRICAS_CARGADAS",
  reclamoHasta: null,
}

/** La página como la pinta el servidor: sin abierta, el formulario; con ella, su estado. */
function Pagina({
  apertura,
  abierta,
}: {
  apertura: AperturaDisputa
  abierta: string | null
}) {
  return (
    <PanelDisputa
      apertura={abierta ? null : apertura}
      disputaAbiertaId={abierta}
      ahoraServidor={AHORA.getTime()}
    >
      {abierta ? (
        <section
          id="estado-disputa"
          tabIndex={-1}
          aria-label="Recibimos tu reclamo"
        >
          Conversación
        </section>
      ) : (
        <p>Disputas anteriores</p>
      )}
    </PanelDisputa>
  )
}

function enviar(modo: "reclamo" | "problema") {
  return screen.getByRole("button", {
    name: modo === "reclamo" ? "Enviar reclamo" : "Reportar el problema",
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.clearAllMocks()
  acciones.enviarMensajeDisputa.mockResolvedValue(exito({ mensajeId: 1 }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("PanelDisputa · reclamo de una vencida (MED-011 c2)", () => {
  it("llega con «Otro», la descripción precargada, el plazo y lo que pasa mientras tanto", () => {
    render(<Pagina apertura={RECLAMO} abierta={null} />)
    expect(
      screen.getByRole("radio", { name: "Sí publiqué y no se registró" })
    ).toBeChecked()
    expect(screen.getByRole("textbox", { name: "Descríbelo" })).toHaveValue(
      "Sí publiqué y no se registró"
    )
    expect(screen.getByText(/^Reclama en 2 días/)).toBeInTheDocument()
    expect(
      screen.getByText(
        "Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás 24 horas para cargar la evidencia."
      )
    ).toBeVisible()
    // Quién verá lo que escribe, asociado al campo.
    expect(
      screen.getByRole("textbox", { name: "Descríbelo" })
    ).toHaveAccessibleDescription(
      "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
    )
    // Las anteriores siguen debajo del formulario.
    expect(screen.getByText("Disputas anteriores")).toBeInTheDocument()
  })

  it("abre el reclamo, manda el enlace como primer mensaje y lleva el foco al estado", async () => {
    const usuario = userEvent.setup()
    acciones.abrirDisputa.mockResolvedValue(exito({ disputaId: DISPUTA }))
    const { rerender } = render(<Pagina apertura={RECLAMO} abierta={null} />)

    await usuario.type(
      screen.getByRole("textbox", {
        name: "Enlace de tu publicación (opcional)",
      }),
      "https://www.instagram.com/p/C8xYz12AbCd/"
    )
    await usuario.click(enviar("reclamo"))

    // El servidor aún no pintó la disputa: lo pide y lo dice.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Quedó abierta. Estamos cargando la conversación…"
    )
    expect(acciones.abrirDisputa).toHaveBeenCalledWith({
      asignacionId: ASIGNACION,
      motivo: "OTRO",
      descripcion: "Sí publiqué y no se registró",
    })
    expect(acciones.enviarMensajeDisputa).toHaveBeenCalledWith({
      disputaId: DISPUTA,
      // El enlace va normalizado (como lo guarda la evidencia).
      mensaje:
        "Este es el enlace de mi publicación: https://www.instagram.com/p/C8xYz12AbCd",
      adjuntoPath: null,
    })
    expect(avisos.success).toHaveBeenCalledWith(
      "Enviamos tu reclamo: el equipo AMO lo revisará."
    )
    expect(enrutador.refresh).toHaveBeenCalled()

    rerender(<Pagina apertura={RECLAMO} abierta={DISPUTA} />)
    const estado = screen.getByRole("region", { name: "Recibimos tu reclamo" })
    await waitFor(() => expect(estado).toHaveFocus())
    expect(
      screen.queryByRole("button", { name: "Enviar reclamo" })
    ).not.toBeInTheDocument()
  })

  it("mantiene el formulario mientras manda las pruebas aunque el servidor ya pinte la disputa", async () => {
    const usuario = userEvent.setup()
    let pintar: (abierta: string) => void = () => {}
    // Como en Next: la respuesta de la acción trae la página refrescada (ya
    // con la disputa abierta) antes de que el formulario mande las pruebas.
    acciones.abrirDisputa.mockImplementation(async () => {
      await new Promise((resolver) => setTimeout(resolver, 0))
      pintar(DISPUTA)
      return exito({ disputaId: DISPUTA })
    })
    acciones.enviarMensajeDisputa.mockImplementation(async () => {
      // La subida y el envío viven en el formulario: no se desmonta a mitad.
      expect(
        screen.getByRole("form", { name: "Cuéntanos qué pasó" })
      ).toBeInTheDocument()
      return exito({ mensajeId: 1 })
    })
    const { rerender } = render(<Pagina apertura={RECLAMO} abierta={null} />)
    pintar = (abierta) =>
      rerender(<Pagina apertura={RECLAMO} abierta={abierta} />)

    await usuario.type(
      screen.getByRole("textbox", {
        name: "Enlace de tu publicación (opcional)",
      }),
      "https://www.instagram.com/p/C8xYz12AbCd/"
    )
    await usuario.click(enviar("reclamo"))

    const estado = await screen.findByRole("region", {
      name: "Recibimos tu reclamo",
    })
    await waitFor(() => expect(estado).toHaveFocus())
    expect(acciones.enviarMensajeDisputa).toHaveBeenCalledTimes(1)
    expect(enrutador.refresh).not.toHaveBeenCalled()
  })

  it("un enlace que no es de una publicación se explica junto al campo y no abre nada", async () => {
    const usuario = userEvent.setup()
    render(<Pagina apertura={RECLAMO} abierta={null} />)
    const enlace = screen.getByRole("textbox", {
      name: "Enlace de tu publicación (opcional)",
    })
    await usuario.type(enlace, "https://www.instagram.com/medioe2e/")
    await usuario.click(enviar("reclamo"))

    expect(acciones.abrirDisputa).not.toHaveBeenCalled()
    expect(enlace).toHaveAttribute("aria-invalid", "true")
    expect(enlace).toHaveFocus()
    expect(enlace).toHaveAccessibleDescription(/Por ejemplo: https:\/\//)
  })

  it("si las pruebas no se envían, la disputa queda abierta y lo avisa junto al hilo", async () => {
    const usuario = userEvent.setup()
    acciones.abrirDisputa.mockResolvedValue(exito({ disputaId: DISPUTA }))
    acciones.enviarMensajeDisputa.mockResolvedValue(
      fallo("Esta disputa ya se cerró.")
    )
    const { rerender } = render(<Pagina apertura={RECLAMO} abierta={null} />)
    await usuario.type(
      screen.getByRole("textbox", {
        name: "Enlace de tu publicación (opcional)",
      }),
      "https://www.instagram.com/p/C8xYz12AbCd/"
    )
    await usuario.click(enviar("reclamo"))
    await screen.findByText(/Estamos cargando la conversación/)
    rerender(<Pagina apertura={RECLAMO} abierta={DISPUTA} />)

    const aviso = screen.getByRole("alert")
    expect(aviso).toHaveTextContent("Tus pruebas no se enviaron")
    expect(aviso).toHaveTextContent(
      "No pudimos enviar tus pruebas (Esta disputa ya se cerró). Envíalas desde la conversación."
    )
    expect(
      screen.getByRole("region", { name: "Recibimos tu reclamo" })
    ).toBeInTheDocument()
  })
})

describe("PanelDisputa · reportar un problema", () => {
  it("sin motivo ni descripción, los errores quedan en sus campos y el foco en el primero", async () => {
    const usuario = userEvent.setup()
    render(<Pagina apertura={PROBLEMA} abierta={null} />)
    // El anunciante sabe qué pasa mientras dure y quién lo verá.
    expect(
      screen.getByText(
        "Mientras dure la disputa, esta publicación no se verifica ni se liquida. Lo que escribas lo verán el medio y el equipo AMO."
      )
    ).toBeVisible()
    expect(screen.queryByRole("radio", { checked: true })).toBeNull()

    await usuario.click(enviar("problema"))

    expect(acciones.abrirDisputa).not.toHaveBeenCalled()
    const motivos = screen.getByRole("radiogroup", { name: "Motivo" })
    expect(motivos).toHaveAccessibleDescription("Elige el motivo.")
    expect(within(motivos).getAllByRole("radio")[0]).toHaveFocus()
    expect(
      screen.getByRole("textbox", { name: "Qué pasó" })
    ).toHaveAccessibleDescription(
      /^Describe lo que pasó \(al menos 10 caracteres\)\./
    )
    // Sin enlace en un reporte: es solo del reclamo.
    expect(
      screen.queryByRole("textbox", { name: /Enlace de tu publicación/ })
    ).not.toBeInTheDocument()
  })

  it("elegir un motivo deja un ejemplo y envía el reporte; un fallo se dice sin perder lo escrito", async () => {
    const usuario = userEvent.setup()
    acciones.abrirDisputa.mockResolvedValueOnce(
      fallo("Ya hay una disputa abierta sobre esta asignación.")
    )
    render(<Pagina apertura={PROBLEMA} abierta={null} />)
    await usuario.click(screen.getByRole("radio", { name: "Métricas" }))
    const descripcion = screen.getByRole("textbox", { name: "Qué pasó" })
    expect(descripcion).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/^Ej\.: /)
    )
    await usuario.type(
      descripcion,
      "El alcance del corte de 72 horas no coincide con la publicación."
    )
    await usuario.click(enviar("problema"))

    expect(
      await screen.findByText(
        "Ya hay una disputa abierta sobre esta asignación."
      )
    ).toHaveAttribute("role", "alert")
    expect(acciones.abrirDisputa).toHaveBeenCalledWith({
      asignacionId: ASIGNACION,
      motivo: "METRICAS",
      descripcion:
        "El alcance del corte de 72 horas no coincide con la publicación.",
    })
    // Sin pruebas no hay primer mensaje.
    expect(acciones.enviarMensajeDisputa).not.toHaveBeenCalled()
    expect(descripcion).toHaveValue(
      "El alcance del corte de 72 horas no coincide con la publicación."
    )
    expect(enviar("problema")).toBeEnabled()
  })

  it("la descripción admite 4.000 caracteres y el estado del envío se anuncia desde el primero (C1, U3)", async () => {
    const usuario = userEvent.setup()
    render(<Pagina apertura={PROBLEMA} abierta={null} />)
    await usuario.click(screen.getByRole("radio", { name: "Métricas" }))
    // La BD guarda la descripción entera; solo recorta la copia de la asignación.
    expect(screen.getByRole("textbox", { name: "Qué pasó" })).toHaveAttribute(
      "maxLength",
      "4000"
    )
    // Vacía sigue en el árbol de accesibilidad (`sr-only`, no `hidden`).
    const estadoEnvio = enviar("problema")
      .closest("form")
      ?.querySelector('p[role="status"]')
    expect(estadoEnvio).toBeEmptyDOMElement()
    expect(estadoEnvio).toHaveClass("empty:sr-only")
    expect(estadoEnvio).not.toHaveClass("empty:hidden")
  })

  it("un error de campo de la acción vuelve a su campo", async () => {
    const usuario = userEvent.setup()
    acciones.abrirDisputa.mockResolvedValueOnce(
      fallo("Revisa los datos.", {
        descripcion: ["Describe lo que pasó con más detalle."],
      })
    )
    render(<Pagina apertura={PROBLEMA} abierta={null} />)
    await usuario.click(screen.getByRole("radio", { name: "Contenido" }))
    const descripcion = screen.getByRole("textbox", { name: "Qué pasó" })
    await usuario.type(descripcion, "El copy no es el aprobado.")
    await usuario.click(enviar("problema"))
    await waitFor(() => expect(descripcion).toHaveFocus())
    expect(descripcion).toHaveAccessibleDescription(
      /^Describe lo que pasó con más detalle\./
    )
    expect(screen.queryByText("Revisa los datos.")).not.toBeInTheDocument()
  })
})
