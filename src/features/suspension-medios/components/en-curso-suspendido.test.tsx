import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ID_EN_CURSO_SUSPENDIDO } from "../en-curso"
import type { AsignacionEnCurso } from "../tipos"
import { EnCursoSuspendido } from "./en-curso-suspendido"

const EN_CURSO: AsignacionEnCurso = {
  id: "0192f3a4-0000-7000-8000-000000000001",
  estado: "CONTENIDO_ENTREGADO",
  estadoPrevioDisputa: null,
  ofertaId: "0192f3a4-0000-7000-8000-0000000000bb",
  oferta: "Lanzamiento de temporada",
  anunciante: "Café del Sur",
  fechaLimitePublicacion: "2026-10-30T22:00:00Z",
  montoBruto: 480000,
  disputaAbiertaId: null,
  cancelable: true,
}

describe("EnCursoSuspendido", () => {
  it("lista lo que conserva en curso con enlace a su ficha en la misma pestaña", () => {
    render(<EnCursoSuspendido asignaciones={[EN_CURSO]} verDisputas />)
    const seccion = screen.getByRole("region", {
      name: "Asignaciones en curso por revisar",
    })
    const titulo = within(seccion).getByRole("heading", { level: 2 })
    expect(titulo).toHaveAttribute("id", ID_EN_CURSO_SUSPENDIDO)
    expect(titulo).toHaveAttribute("tabindex", "-1")
    expect(seccion).toHaveTextContent(
      "Tiene 1 asignación en curso. Ábrela para decidir si la cancelas con su causa"
    )
    const enlace = within(seccion).getByRole("link", {
      name: "Lanzamiento de temporada",
    })
    expect(enlace).toHaveAttribute(
      "href",
      "/operacion/asignaciones/0192f3a4-0000-7000-8000-000000000001"
    )
    expect(enlace).not.toHaveAttribute("target")
    expect(seccion).toHaveTextContent("Café del Sur · $ 480.000")
    expect(seccion).toHaveTextContent(
      /^.*Descargó el contenido · publica hasta el 30 de oct/
    )
  })

  it("sin asignaciones en curso lo dice sin lista", () => {
    render(<EnCursoSuspendido asignaciones={[]} verDisputas />)
    expect(
      screen.getByRole("region", { name: "Sin asignaciones en curso" })
    ).toHaveTextContent(
      /la suspensión solo le impide ver y aceptar ofertas nuevas/
    )
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})
