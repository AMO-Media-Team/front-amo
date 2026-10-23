import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ID_ESTADO_DISPUTA } from "../foco"
import type { DisputaDetalle } from "../tipos"
import { EstadoDisputa } from "./estado-disputa"

const BASE: DisputaDetalle = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000d1",
  asignacionId: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
  estado: "ABIERTA",
  motivo: "OTRO",
  parte: "MEDIO",
  descripcion: "Sí publiqué y no se registró.",
  estadoOrigen: "VENCIDA_SIN_PUBLICAR",
  resolucion: null,
  estadoResultante: null,
  creadaAt: "2026-10-22T15:00:00Z",
  actualizadaAt: "2026-10-22T15:00:00Z",
  resueltaAt: null,
}

describe("EstadoDisputa", () => {
  it("es una región enfocable con el título de la situación", () => {
    render(<EstadoDisputa disputa={BASE} perspectiva="medio" />)
    const region = screen.getByRole("region", { name: "Recibimos tu reclamo" })
    expect(region).toHaveAttribute("id", ID_ESTADO_DISPUTA)
    expect(region).toHaveAttribute("tabindex", "-1")
    expect(region).toHaveTextContent(
      "Mientras lo revisamos, el cupo no vuelve a tu cuenta."
    )
    expect(region).toHaveTextContent("La abriste tú el")
    expect(region).toHaveTextContent("Motivo: otro motivo")
  })

  it("cerrada: el resultado en la voz de la parte y la explicación del equipo", () => {
    render(
      <EstadoDisputa
        disputa={{
          ...BASE,
          estado: "RESUELTA",
          estadoResultante: "CONTENIDO_ENTREGADO",
          resolucion: "La captura muestra la publicación a tiempo.",
          resueltaAt: "2026-10-23T15:00:00Z",
        }}
        perspectiva="medio"
        contexto={{ plazoRecargaHoras: 24 }}
      />
    )
    const region = screen.getByRole("region", { name: "Te dimos la razón" })
    expect(region).toHaveTextContent(
      "Tienes 24 horas desde la resolución para cargar la evidencia"
    )
    expect(region).toHaveTextContent("Explicación del equipo AMO")
    expect(region).toHaveTextContent(
      "La captura muestra la publicación a tiempo."
    )
    expect(region).toHaveTextContent("Cerrada el")
  })

  it("el equipo ve quién la abrió y que espera que alguien la tome", () => {
    render(
      <EstadoDisputa
        disputa={{ ...BASE, parte: "ANUNCIANTE", estadoOrigen: "PUBLICADA" }}
        perspectiva="interno"
      />
    )
    expect(
      screen.getByRole("region", { name: "Espera que alguien la tome" })
    ).toHaveTextContent("La abrió el anunciante.")
  })
})
