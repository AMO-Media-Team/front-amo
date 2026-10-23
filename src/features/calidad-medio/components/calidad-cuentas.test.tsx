import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Route } from "next"
import { describe, expect, it } from "vitest"

import {
  calidadDeCuentas,
  ID_CALIDAD_CUENTAS,
  PARAMETROS_CALIDAD_POR_DEFECTO as PARAMETROS,
} from "../calidad"
import type { CuentaCalidad } from "../tipos"
import { CalidadCuentas } from "./calidad-cuentas"

const AHORA = new Date("2026-10-23T15:00:00Z")

const plano = (texto: string | null) => (texto ?? "").replace(/[  ]/g, " ")

function cuenta(cambios: Partial<CuentaCalidad>): CuentaCalidad {
  return {
    id: "c1",
    plataforma: "INSTAGRAM",
    handle: "noticias.pereira",
    seguidores: 48_000,
    franja: { clave: "F1", nombre: "30.000 – 60.000" },
    alcanceMediano: 2_016,
    indice: 0.042,
    indiceFranja: 0.0375,
    multiplicador: 1,
    proximo: 1.12,
    proximoDesde: "2026-10-30T05:00:00Z",
    publicacionesVerificadas: 20,
    calculadoAt: "2026-10-19T11:00:00Z",
    ...cambios,
  }
}

function dibujar(cuentas: CuentaCalidad[], enlace?: Route) {
  return render(
    <CalidadCuentas
      calidades={calidadDeCuentas(cuentas, PARAMETROS)}
      parametros={PARAMETROS}
      ahora={AHORA}
      enlaceCuentas={enlace}
    />
  )
}

describe("CalidadCuentas", () => {
  it("por cuenta: multiplicador de hoy, próximo con su fecha y por qué", () => {
    dibujar(
      [
        cuenta({}),
        cuenta({
          id: "c2",
          plataforma: "TIKTOK",
          handle: "pereira.tv",
          proximo: null,
          proximoDesde: null,
          publicacionesVerificadas: 2,
        }),
      ],
      "/mi-medio/cuentas" as Route
    )
    const region = screen.getByRole("region", {
      name: "Calidad de tus cuentas",
    })
    expect(region.closest(`#${ID_CALIDAD_CUENTAS}`)).not.toBeNull()

    const [instagram, tiktok] = within(
      screen.getByRole("list", { name: "Multiplicador por cuenta" })
    ).getAllByRole("listitem")
    expect(
      within(instagram).getByRole("heading", { name: /@noticias\.pereira/ })
    ).toBeInTheDocument()
    expect(within(instagram).getByRole("definition").textContent).toBe("1,00 ×")
    expect(plano(instagram.textContent)).toContain(
      "Franja 30.000 – 60.000 · 48.000 seguidores"
    )
    expect(instagram).toHaveTextContent(
      "Próximo: 1,12 ×. Desde el 30 de octubre pasará de 1,00 a 1,12 por el buen alcance de tus últimas 20 publicaciones."
    )
    expect(instagram).toHaveTextContent("Por encima de tu franja")
    expect(instagram).toHaveTextContent(
      "Calculado el 19 de octubre con tus últimas 20 publicaciones verificadas (métricas de 7 días)."
    )

    // Sin historial suficiente: 1,00 y cuántas le faltan, sin aviso de cambio.
    expect(within(tiktok).getByRole("definition").textContent).toBe("1,00 ×")
    expect(tiktok).toHaveTextContent("Sin historial suficiente")
    expect(tiktok).toHaveTextContent("Llevas 2 de 5.")
    expect(tiktok).not.toHaveTextContent("Próximo")

    expect(
      within(region).getByRole("link", { name: "Ver mis cuentas" })
    ).toHaveAttribute("href", "/mi-medio/cuentas")
  })

  it("el paso a paso del cálculo se despliega con el teclado", async () => {
    const usuario = userEvent.setup()
    dibujar([cuenta({})])
    const boton = screen.getByRole("button", { name: "¿Cómo se calcula?" })
    expect(boton).toHaveAttribute("aria-expanded", "false")
    boton.focus()
    await usuario.keyboard("{Enter}")
    expect(boton).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByText(
        "Con menos de 5 publicaciones verificadas, el multiplicador es 1,00."
      )
    ).toBeVisible()
  })

  it("sin cuentas verificadas explica qué aparecerá y no enlaza sin permiso", () => {
    dibujar([])
    expect(
      screen.getByText(/Aún no tienes cuentas verificadas/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})
