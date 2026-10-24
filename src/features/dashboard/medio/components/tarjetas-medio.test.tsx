import { render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { describe, expect, it } from "vitest"

import { filaKpi } from "@/features/dashboard/insights/fixtures"

import { NEGOCIOS } from "../../fixtures"
import { progresoTope, RUTA_SUBIR_DE_NIVEL } from "../datos"
import { NEGOCIOS_MEDIO } from "../fixtures"
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

  it("enlaza a «Ganancias» solo si el rol puede abrirla", () => {
    const { unmount } = render(
      <HeroGanancias
        {...props}
        ganado={undefined}
        pendiente={0}
        pagado={0}
        enlaceGanancias={"/ganancias" as Route}
      />
    )
    expect(screen.getByRole("link", { name: "Ver ganancias" })).toHaveAttribute(
      "href",
      "/ganancias"
    )
    unmount()
    render(
      <HeroGanancias {...props} ganado={undefined} pendiente={0} pagado={0} />
    )
    expect(
      screen.queryByRole("link", { name: "Ver ganancias" })
    ).not.toBeInTheDocument()
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
  const dibujar = (
    consumido: number,
    tope: number | null = umbrales.tope,
    enlaceNivel: Route | null = null
  ) =>
    render(
      <ProgresoTopeAnual
        progreso={progresoTope({ ...umbrales, tope, consumido })}
        consumido={consumido}
        tope={tope}
        nivel="Nivel 1 · año 2026"
        alerta={umbrales.alerta}
        bloqueo={umbrales.bloqueo}
        enlaceNivel={enlaceNivel}
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

  it("cerca del tope dice cuánto le queda y enlaza a «Cómo subir de nivel»", () => {
    // Un medio al 82 % de su tope anual (DSH-006).
    dibujar(24_600_000, umbrales.tope, RUTA_SUBIR_DE_NIVEL)
    expect(
      screen.getByText(/te quedan .* antes del bloqueo al 95%/)
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Cómo subir de nivel" })
    ).toHaveAttribute("href", "/mi-medio/nivel#subir-de-nivel")
  })

  it("lejos del tope, o sin enlace (en «Mi medio › Nivel»), no lo muestra", () => {
    const { unmount } = dibujar(5_000_000, umbrales.tope, RUTA_SUBIR_DE_NIVEL)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    unmount()
    dibujar(29_000_000)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
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
      screen.getByText("Ajusta tu pago según el alcance de tus cuentas")
    ).toBeInTheDocument()
    expect(
      screen.getByText("1 publicación aprobada en el periodo.")
    ).toBeInTheDocument()
  })

  it("el multiplicador es el vigente, con su nota y tres decimales si los tiene", () => {
    render(
      <Reputacion
        cumplimiento={undefined}
        calificacion={null}
        multiplicador={0.784}
        notaMultiplicador="Pasará a 0,92 el 30 de octubre"
        publicaciones={null}
        nMinimoCumplimiento={3}
      />
    )
    expect(screen.getByText("0,784 ×")).toBeInTheDocument()
    expect(
      screen.getByText("Pasará a 0,92 el 30 de octubre")
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
    expect(
      screen.getByText("Llega con la calificación de los anunciantes")
    ).toBeInTheDocument()
    expect(screen.getAllByText("—")).toHaveLength(3)
  })

  it("el mínimo de negocios es el vigente que trae la reputación", () => {
    render(
      <Reputacion
        cumplimiento={filaKpi("tasa_cumplimiento", null, null, { n: 4 })}
        calificacion={null}
        multiplicador={null}
        publicaciones={null}
        nMinimoCumplimiento={5}
      />
    )
    expect(
      screen.getByText("Sin historial suficiente (4 de 5 negocios)")
    ).toBeInTheDocument()
  })

  it("enlaza al detalle en «Mi medio › Reputación» solo si se puede abrir", () => {
    const props = {
      cumplimiento: undefined,
      calificacion: null,
      multiplicador: null,
      publicaciones: 2,
      nMinimoCumplimiento: 3,
    }
    const { unmount } = render(
      <Reputacion
        {...props}
        enlaceReputacion={"/mi-medio/reputacion" as Route}
      />
    )
    expect(
      screen.getByRole("link", { name: "Ver tu reputación" })
    ).toHaveAttribute("href", "/mi-medio/reputacion")
    unmount()
    render(<Reputacion {...props} enlaceReputacion={null} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
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

  it("con «Mis campañas», cada negocio lleva a su ficha", () => {
    render(
      <NegociosEnCurso
        negocios={NEGOCIOS_MEDIO}
        activas={2}
        enlaceTodas={"/mis-campanas" as Route}
      />
    )
    const [cafe, vacaciones] = screen.getAllByRole("listitem")
    expect(
      within(cafe).getByRole("link", {
        name: "Café de Colombia · historia patrocinada",
      })
    ).toHaveAttribute("href", "/mis-campanas/a3")
    expect(cafe).toHaveTextContent(
      "Por publicar · Café de Colombia · Instagram @noticias.pereira"
    )
    expect(
      within(vacaciones).getByRole("link", { name: "Temporada de vacaciones" })
    ).toHaveAttribute("href", "/mis-campanas/a5")
    expect(
      screen.getByRole("link", { name: "Ver mis campañas" })
    ).toHaveAttribute("href", "/mis-campanas")
  })

  it("sin negocios en curso explica qué aparecerá", () => {
    render(<NegociosEnCurso negocios={[]} activas={0} />)
    expect(screen.getByText(/No tienes negocios en curso/)).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })
})
