import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ContadoresColas } from "../tipos"

// Los contadores leen la BD (server-only): se sustituyen por un espía.
const consultas = vi.hoisted(() => ({ contadoresColas: vi.fn() }))
vi.mock("../queries", () => consultas)

import { accesoColas } from "../colas"
import { EsqueletoNavegacionColas, NavegacionColas } from "./navegacion-colas"

const CONTADORES: ContadoresColas = {
  medios: 2,
  cuentas: 0,
  documentos: 1,
  solicitudes: 0,
  anunciantes: 3,
}

beforeEach(() => {
  consultas.contadoresColas.mockReset().mockResolvedValue(CONTADORES)
})

function enlaces(): HTMLElement[] {
  return within(
    screen.getByRole("navigation", { name: "Colas de verificación" })
  ).getAllByRole("link")
}

describe("NavegacionColas", () => {
  it("quien verifica todo ve las cinco colas con lo pendiente en cada una", async () => {
    const acceso = accesoColas([
      "medios.verificar",
      "datos_sensibles.ver",
      "anunciantes.verificar",
    ])
    render(await NavegacionColas({ activa: "anunciantes", acceso }))
    expect(
      enlaces().map((enlace) => enlace.getAttribute("aria-label"))
    ).toEqual([
      "Medios: 2 pendientes",
      "Cuentas: nada pendiente",
      "Documentos: 1 pendiente",
      "Solicitudes: nada pendiente",
      "Anunciantes: 3 pendientes",
    ])
    const anunciantes = screen.getByRole("link", { name: /^Anunciantes:/ })
    expect(anunciantes).toHaveAttribute("aria-current", "page")
    expect(anunciantes).toHaveAttribute(
      "href",
      "/operacion/verificacion?cola=anunciantes"
    )
  })

  it("un rol que solo verifica anunciantes ve únicamente su cola", async () => {
    consultas.contadoresColas.mockResolvedValue({
      ...CONTADORES,
      medios: null,
      cuentas: null,
      documentos: null,
      solicitudes: null,
    })
    render(
      await NavegacionColas({
        activa: "anunciantes",
        acceso: accesoColas(["anunciantes.verificar"]),
      })
    )
    expect(enlaces()).toHaveLength(1)
    expect(enlaces()[0]).toHaveAccessibleName("Anunciantes: 3 pendientes")
  })

  it("quien verifica medios sin datos sensibles ve documentos sin acceso", async () => {
    consultas.contadoresColas.mockResolvedValue({
      ...CONTADORES,
      documentos: null,
      anunciantes: null,
    })
    render(
      await NavegacionColas({
        activa: "medios",
        acceso: accesoColas(["medios.verificar"]),
      })
    )
    expect(enlaces()).toHaveLength(4)
    expect(
      screen.getByRole("link", { name: "Documentos: sin acceso" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /^Anunciantes:/ })
    ).not.toBeInTheDocument()
  })
})

describe("EsqueletoNavegacionColas", () => {
  it("anuncia la carga y reserva una tarjeta por cola visible", () => {
    const { container } = render(
      <EsqueletoNavegacionColas
        acceso={accesoColas(["anunciantes.verificar"])}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("Cargando las colas…")
    expect(container.querySelector("[aria-hidden]")?.childElementCount).toBe(1)
  })
})
