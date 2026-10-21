import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { filaKpi } from "@/features/dashboard/insights/fixtures"

import { acciones, AHORA, NEGOCIOS } from "../../fixtures"
import { progresoTope } from "../datos"
import { ProximasAcciones } from "./proximas-acciones"
import {
  HeroGanancias,
  NegociosEnCurso,
  ProgresoTopeAnual,
  Reputacion,
} from "./tarjetas-medio"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null) => (texto ?? "").replace(/[  ]/g, " ")

describe("HeroGanancias", () => {
  const props = {
    titulo: "Ganado este mes",
    etiquetaComparacion: "vs. mismos días de septiembre",
  }

  it("lo pendiente y lo pagado van en pesos exactos, con su base", () => {
    render(
      <HeroGanancias
        {...props}
        ganado={filaKpi("ganado_periodo", 1_840_000, 1_420_000)}
        pendiente={920_000}
        pagado={12_640_000}
      />
    )
    expect(
      screen.getByRole("heading", { name: "Ganado este mes" })
    ).toBeInTheDocument()
    const montos = screen.getAllByRole("definition")
    expect(plano(montos[0].textContent)).toBe("$ 920.000")
    expect(plano(montos[2].textContent)).toBe("$ 12.640.000")
    expect(
      screen.getByText(/vs\. mismos días de septiembre · antes de retenciones/)
    ).toBeInTheDocument()
    expect(screen.getByText(/Subió 29,6% frente al periodo/)).toHaveClass(
      "sr-only"
    )
  })

  it("sin ganancias ni base de comparación explica cuándo se suma", () => {
    render(
      <HeroGanancias
        {...props}
        ganado={undefined}
        pendiente={0}
        pagado={null}
      />
    )
    expect(
      screen.getByText(
        "Se suma al verificarse cada negocio · antes de retenciones"
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/vs\. mismos días/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("definition")[2]).toHaveTextContent("—")
  })

  it("desde cien millones abrevia: la cifra exacta ya no cabe", () => {
    render(
      <HeroGanancias
        {...props}
        ganado={undefined}
        pendiente={0}
        pagado={125_400_000}
      />
    )
    expect(plano(screen.getAllByRole("definition")[2].textContent)).toBe(
      "$125,4 M"
    )
  })
})

describe("ProgresoTopeAnual", () => {
  const umbrales = { tope: 30_000_000, alerta: 0.8, bloqueo: 0.95 }
  const dibujar = (consumido: number, tope: number | null = umbrales.tope) =>
    render(
      <ProgresoTopeAnual
        progreso={progresoTope({ ...umbrales, tope, consumido })}
        consumido={consumido}
        tope={tope}
        nivel="Nivel 1 · año 2026"
        alerta={umbrales.alerta}
        bloqueo={umbrales.bloqueo}
      />
    )

  it("el medidor expone el avance y avisa cerca del tope", () => {
    dibujar(25_200_000)
    const medidor = screen.getByRole("meter", { name: "Avance del tope anual" })
    expect(medidor).toHaveAttribute("aria-valuenow", "25200000")
    expect(medidor).toHaveAttribute("aria-valuemax", "30000000")
    expect(plano(medidor.getAttribute("aria-valuetext"))).toBe(
      "$ 25.200.000 de $ 30.000.000 (84%)"
    )
    expect(screen.getByText(/Estás cerca del tope de tu nivel/)).toBeVisible()
  })

  it("en el umbral de bloqueo dice que no podrá aceptar ofertas", () => {
    dibujar(29_000_000)
    expect(
      screen.getByText(/no podrás aceptar nuevas ofertas/)
    ).toBeInTheDocument()
  })

  it("un nivel sin tope no dibuja la barra", () => {
    dibujar(4_000_000, null)
    expect(screen.queryByRole("meter")).not.toBeInTheDocument()
    expect(
      screen.getByText("Tu nivel de verificación no tiene tope anual.")
    ).toBeInTheDocument()
  })
})

describe("Reputacion", () => {
  it("una fila por dato, con la nota que lo explica", () => {
    render(
      <Reputacion
        cumplimiento={filaKpi("tasa_cumplimiento", 0.94, 0.9, { n: 32 })}
        calificacion={4.7}
        multiplicador={1.15}
        publicaciones={1}
        nMinimoCumplimiento={3}
      />
    )
    expect(
      screen.getAllByRole("term").map((termino) => termino.textContent)
    ).toEqual(["Cumplimiento", "Calificación", "Multiplicador"])
    expect(screen.getByText("94%")).toHaveClass("text-success")
    expect(screen.getByText("Últimos 180 días · 32 negocios")).toBeVisible()
    expect(screen.getByText("4,7 / 5")).toBeInTheDocument()
    expect(screen.getByText("1,15 ×")).toBeInTheDocument()
    expect(
      screen.getByText("1 publicación aprobada en el periodo.")
    ).toBeInTheDocument()
  })

  it("sin historial suficiente no inventa una tasa", () => {
    render(
      <Reputacion
        cumplimiento={filaKpi("tasa_cumplimiento", null, null, { n: 1 })}
        calificacion={null}
        multiplicador={null}
        publicaciones={null}
        nMinimoCumplimiento={3}
      />
    )
    expect(
      screen.getByText("Sin historial suficiente (1 de 3 negocios)")
    ).toBeInTheDocument()
    expect(screen.getByText("Aún sin calificaciones")).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(3)
  })
})

describe("NegociosEnCurso", () => {
  it("nombra cada negocio por su oferta; sin ella, por su estado", () => {
    render(<NegociosEnCurso negocios={NEGOCIOS} activas={5} />)
    const [conMarca, sinMarca, sinOferta] = screen.getAllByRole("listitem")
    expect(conMarca).toHaveTextContent(
      "Café de Colombia · historia patrocinada"
    )
    expect(conMarca).toHaveTextContent(
      "Por descargar · Café de Colombia · Instagram"
    )
    expect(plano(conMarca.textContent)).toContain("$ 480.000")
    expect(sinMarca).toHaveTextContent("Evidencia en revisión · TikTok")
    expect(sinOferta).toHaveTextContent(/^Por cargar métricasFacebook—$/)
    expect(
      within(sinOferta).getByRole("img", {
        name: "Paso 4 de 5: Por cargar métricas",
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText("Y 2 más en curso (se muestran los más recientes).")
    ).toBeInTheDocument()
  })

  it("sin negocios en curso explica qué aparecerá", () => {
    render(<NegociosEnCurso negocios={[]} activas={0} />)
    expect(screen.getByText(/No tienes negocios en curso/)).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})

describe("ProximasAcciones", () => {
  // Tras hidratar, la cuenta regresiva sigue el reloj del dispositivo: se fija
  // en `AHORA` para que los plazos del fixture no dependan del día de ejecución.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("cada acción con su plazo; la urgencia se lee además de verse", () => {
    render(
      <ProximasAcciones
        acciones={acciones(AHORA)}
        ahoraServidor={AHORA.getTime()}
      />
    )
    const filas = within(
      screen.getByRole("list", { name: "Acciones pendientes" })
    ).getAllByRole("listitem")
    expect(filas).toHaveLength(4)
    expect(filas[0]).toHaveTextContent("Publicar la pauta")
    expect(filas[0]).toHaveTextContent(/Venció hace/)
    expect(filas[2]).toHaveTextContent("Descargar el contenido")
    expect(filas[2]).toHaveTextContent(/Vence en/)
    expect(filas[3]).toHaveTextContent("Sin fecha límite")
  })

  it("sin pendientes lo dice en positivo", () => {
    render(<ProximasAcciones acciones={[]} ahoraServidor={AHORA.getTime()} />)
    expect(screen.getByText("Nada pendiente")).toBeInTheDocument()
  })
})
