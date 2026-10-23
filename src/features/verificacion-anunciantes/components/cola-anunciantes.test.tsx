import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AnuncianteEnCola, ColaAnunciantes as Cola } from "../tipos"

// La cola lee la BD (server-only): se sustituye por un espía.
const consultas = vi.hoisted(() => ({ colaAnunciantes: vi.fn() }))
vi.mock("../queries", () => consultas)

import { ColaAnunciantes } from "./cola-anunciantes"

function empresa(cambios: Partial<AnuncianteEnCola> = {}): AnuncianteEnCola {
  return {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000aa",
    nombreComercial: "Café del Sur",
    razonSocial: "Café del Sur S.A.S.",
    identificacion: "900.123.456-7",
    tipoIdentificacion: "NIT",
    paisIso2: "CO",
    pais: "Colombia",
    ciudad: "Pasto",
    estado: "PENDIENTE",
    desde: "2026-10-21T15:00:00.000Z",
    enviadoAt: "2026-10-21T15:00:00.000Z",
    reenvio: false,
    documentosPorRevisar: 2,
    faltan: [],
    listos: false,
    ...cambios,
  }
}

function cola(filas: AnuncianteEnCola[], total = filas.length): Cola {
  return { filas, total, pagina: 1 }
}

async function renderizar(datos: Cola) {
  consultas.colaAnunciantes.mockResolvedValue(datos)
  render(await ColaAnunciantes({ pagina: 1 }))
}

/** Los tiempos relativos («ayer») dependen del reloj: se fija. */
const AHORA = new Date("2026-10-22T15:00:00.000Z")

beforeEach(() => {
  consultas.colaAnunciantes.mockReset()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ColaAnunciantes", () => {
  it("cada empresa muestra su identificación, lo que espera y cómo revisarla", async () => {
    await renderizar(cola([empresa()]))
    const tarjeta = screen.getByRole("article", { name: "Café del Sur" })
    expect(within(tarjeta).getByText("900.123.456-7")).toBeInTheDocument()
    expect(within(tarjeta).getByText("Pasto, Colombia")).toBeInTheDocument()
    expect(tarjeta).toHaveTextContent(/Enviada ayer/)
    expect(
      within(tarjeta).getByText("2 documentos por revisar")
    ).toBeInTheDocument()
    expect(
      within(tarjeta).getByText("Documentos exigidos cargados")
    ).toBeInTheDocument()
    expect(
      within(tarjeta).getByRole("link", { name: "Revisar Café del Sur" })
    ).toHaveAttribute(
      "href",
      "/operacion/anunciantes/0192f3a4-5b6c-7d8e-9f01-0000000000aa?pestana=verificacion"
    )
  })

  it("distingue el reenvío, lo que falta y la empresa que aún no la envía", async () => {
    await renderizar(
      cola([
        empresa({
          id: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
          nombreComercial: "Reenviada",
          reenvio: true,
          faltan: ["CAMARA_COMERCIO"],
        }),
        empresa({
          id: "0192f3a4-5b6c-7d8e-9f01-0000000000a2",
          nombreComercial: "Sin enviar",
          enviadoAt: null,
          documentosPorRevisar: 1,
        }),
      ])
    )
    const reenviada = screen.getByRole("article", { name: "Reenviada" })
    expect(within(reenviada).getByText("Reenvío")).toBeInTheDocument()
    expect(
      within(reenviada).getByText("Falta: Cámara de Comercio")
    ).toBeInTheDocument()

    const sinEnviar = screen.getByRole("article", { name: "Sin enviar" })
    expect(within(sinEnviar).getByText("Aún no la envía")).toBeInTheDocument()
    expect(sinEnviar).toHaveTextContent(/Documento cargado ayer/)
  })

  it("una empresa verificada que renovó un documento muestra su estado", async () => {
    await renderizar(
      cola([
        empresa({
          estado: "VERIFICADO",
          enviadoAt: null,
          documentosPorRevisar: 1,
          listos: true,
        }),
      ])
    )
    const tarjeta = screen.getByRole("article", { name: "Café del Sur" })
    expect(within(tarjeta).getByText("Verificado")).toBeInTheDocument()
    expect(
      within(tarjeta).getByText("Documentos exigidos aprobados")
    ).toBeInTheDocument()
  })

  it("sin pendientes muestra el estado vacío", async () => {
    await renderizar(cola([]))
    expect(
      screen.getByText("Ninguna empresa espera verificación.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })

  it("pagina cuando hay más empresas que las de una página", async () => {
    await renderizar(cola([empresa()], 45))
    expect(
      screen.getByRole("navigation", { name: "Páginas de la cola" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Siguientes/ })).toHaveAttribute(
      "href",
      "/operacion/verificacion?cola=anunciantes&pagina=2"
    )
  })
})
