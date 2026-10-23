import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { DisputaDetalle, MensajeDisputa } from "@/features/disputas/tipos"

// El hilo trae la caja de respuesta: sus acciones y su subida no corren aquí.
vi.mock("@/features/disputas/actions", () => ({
  enviarMensajeDisputa: vi.fn(),
  prepararAdjuntoDisputa: vi.fn(),
  confirmarAdjuntoDisputa: vi.fn(),
  firmarAdjuntoDisputa: vi.fn(),
}))
vi.mock("@/components/archivos/use-carga-captura", () => ({
  useCargaCaptura: () => ({
    estado: "inactiva",
    elegir: vi.fn(),
    descartar: vi.fn(),
    reintentar: () => {},
    obtener: vi.fn(),
  }),
}))

import { ContenidoDisputa } from "./contenido-disputa"

function disputa(cambios: Partial<DisputaDetalle> = {}): DisputaDetalle {
  return {
    id: "0199f3a0-0000-7000-8000-0000000000d1",
    asignacionId: "0199f3a0-0000-7000-8000-00000000a501",
    estado: "ABIERTA",
    motivo: "OTRO",
    parte: "MEDIO",
    descripcion: "Sí publiqué y no se registró",
    estadoOrigen: "VENCIDA_SIN_PUBLICAR",
    resolucion: null,
    estadoResultante: null,
    creadaAt: "2026-10-22T15:00:00.000Z",
    actualizadaAt: "2026-10-22T15:00:00.000Z",
    resueltaAt: null,
    ...cambios,
  }
}

const MENSAJE: MensajeDisputa = {
  id: 1,
  autorParte: "MEDIO",
  autorNombre: "Medio E2E",
  autorPersona: null,
  esMio: true,
  mensaje:
    "Este es el enlace de mi publicación: https://www.instagram.com/p/C8x",
  adjunto: null,
  interno: false,
  creadoAt: "2026-10-22T15:01:00.000Z",
}

describe("ContenidoDisputa", () => {
  it("abierta: su estado en la voz del medio y la conversación para responder", () => {
    render(
      <ContenidoDisputa
        vista={{ tipo: "abierta", disputa: disputa(), anteriores: [] }}
        perspectiva="medio"
        mensajes={[MENSAJE]}
        contexto={{ plazoRecargaHoras: 24 }}
        puedeEscribir
      />
    )
    expect(
      screen.getByRole("region", { name: "Recibimos tu reclamo" })
    ).toHaveTextContent(
      "Mientras lo revisamos, el cupo no vuelve a tu cuenta. Si te damos la razón, tendrás 24 horas para cargar la evidencia."
    )
    expect(
      screen.getByRole("region", { name: "Conversación" })
    ).toHaveTextContent(MENSAJE.mensaje)
    expect(
      screen.getByText(
        "Lo que escribas y adjuntes lo verán el anunciante y el equipo AMO."
      )
    ).toBeInTheDocument()
  })

  it("cerrada: el resultado con la explicación, por qué no hay otra y el hilo en solo lectura", () => {
    const reabierta = disputa({
      estado: "RESUELTA",
      estadoResultante: "CONTENIDO_ENTREGADO",
      resolucion: "La captura muestra que publicaste a tiempo.",
      resueltaAt: "2026-10-23T10:00:00.000Z",
    })
    render(
      <ContenidoDisputa
        vista={{
          tipo: "cerrada",
          disputa: reabierta,
          anteriores: [],
          bloqueo: "Ya reclamaste esta publicación.",
        }}
        perspectiva="medio"
        mensajes={[]}
        contexto={{
          plazoRecargaHoras: 24,
          fechaLimitePublicacion: "2026-10-24T10:00:00.000Z",
        }}
        puedeEscribir
        accion={<a href="/evidencia">Cargar la evidencia</a>}
      />
    )
    const estado = screen.getByRole("region", { name: "Te dimos la razón" })
    expect(estado).toHaveTextContent(
      /Tienes hasta el .+ para cargar la evidencia/
    )
    expect(estado).toHaveTextContent(
      "La captura muestra que publicaste a tiempo."
    )
    expect(
      screen.getByRole("link", { name: "Cargar la evidencia" })
    ).toBeInTheDocument()
    expect(screen.getByText("Ya reclamaste esta publicación.")).toBeVisible()
    expect(screen.getByText(/La disputa se cerró el/)).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("sin disputa posible: por qué y cómo volver", () => {
    render(
      <ContenidoDisputa
        vista={{
          tipo: "sin_disputa",
          bloqueo:
            "Podrás reportar un problema cuando cargues la evidencia de tu publicación.",
        }}
        perspectiva="medio"
        mensajes={[]}
        contexto={{}}
        puedeEscribir
        volver={<button type="button">Volver a la campaña</button>}
      />
    )
    expect(
      screen.getByText("Esta publicación no admite disputas ahora")
    ).toBeVisible()
    expect(
      screen.getByText(
        "Podrás reportar un problema cuando cargues la evidencia de tu publicación."
      )
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Volver a la campaña" })
    ).toBeInTheDocument()
  })

  it("con el formulario: solo las anteriores, con su resultado", () => {
    render(
      <ContenidoDisputa
        vista={{
          tipo: "abrir",
          modo: "problema",
          motivos: ["METRICAS"],
          anteriores: [
            disputa({
              parte: "ANUNCIANTE",
              motivo: "METRICAS",
              estadoOrigen: "METRICAS_CARGADAS",
              estado: "DESCARTADA",
              estadoResultante: "METRICAS_CARGADAS",
              resolucion: "Las cifras coinciden con la captura.",
              resueltaAt: "2026-10-23T10:00:00.000Z",
            }),
          ],
        }}
        perspectiva="anunciante"
        mensajes={[]}
        contexto={{}}
        puedeEscribir
      />
    )
    const anteriores = screen.getByRole("region", {
      name: "Disputas anteriores",
    })
    expect(anteriores).toHaveTextContent("Se descartó tu disputa")
    expect(anteriores).toHaveTextContent("La abrió tu empresa")
    expect(anteriores).toHaveTextContent(
      "Explicación del equipo AMO: Las cifras coinciden con la captura."
    )
    expect(
      screen.queryByRole("region", { name: "Conversación" })
    ).not.toBeInTheDocument()
  })
})
