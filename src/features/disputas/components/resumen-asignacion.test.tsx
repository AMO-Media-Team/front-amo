import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { AsignacionDisputa } from "../tipos"
import {
  type EnlacesDisputa,
  ResumenAsignacionDisputa,
} from "./resumen-asignacion"

const ASIGNACION: AsignacionDisputa = {
  id: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
  estado: "EN_DISPUTA",
  estadoPrevioDisputa: "VERIFICADA",
  plataforma: "INSTAGRAM",
  formato: "Reel",
  publicacionesEsperadas: 1,
  montoBruto: 450_000,
  aceptadaAt: "2026-10-01T15:00:00Z",
  fechaLimitePublicacion: "2026-10-05T15:00:00Z",
  vencidaAt: null,
  causaCancelacion: null,
  medio: { id: "0192f3a4-5b6c-7d8e-9f01-0000000000b1", nombre: "Radio Pasto" },
  cuenta: {
    handle: "@radiopasto",
    url: "https://www.instagram.com/radiopasto/",
  },
  oferta: {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000c1",
    titulo: "Reel de temporada",
    cerrada: false,
  },
  campana: {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000e1",
    nombre: "Temporada 2026",
    marca: "Café del Huila",
  },
  anunciante: {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000f1",
    nombre: "Café del Huila SAS",
  },
  cortesRequeridos: [],
  publicaciones: [],
  metricas: [],
}

const TODOS: EnlacesDisputa = {
  asignacion: true,
  medio: true,
  campana: true,
  anunciante: true,
  oferta: true,
}

describe("ResumenAsignacionDisputa", () => {
  it("los enlaces apilados miden al menos 24 px de alto (WCAG 2.5.8)", () => {
    render(<ResumenAsignacionDisputa asignacion={ASIGNACION} enlaces={TODOS} />)
    // La campaña y su anunciante van uno debajo del otro: con 20 y 16 px de
    // alto y 2 px entre ellos, axe los marcaba (`target-size`).
    for (const nombre of [
      "Temporada 2026",
      "Café del Huila SAS",
      "Radio Pasto",
      "Reel de temporada",
    ]) {
      const enlace = screen.getByRole("link", { name: nombre })
      expect(enlace).toHaveClass("inline-flex", "min-h-6", "items-center")
    }
  })

  it("sin permiso, el dato queda como texto con el mismo alto", () => {
    render(
      <ResumenAsignacionDisputa
        asignacion={ASIGNACION}
        enlaces={{ ...TODOS, anunciante: false }}
      />
    )
    expect(
      screen.queryByRole("link", { name: "Café del Huila SAS" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("Café del Huila SAS")).toHaveClass("min-h-6")
  })
})
