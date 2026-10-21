import { render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import {
  ACCESOS_SOSPECHOSOS,
  AHORA,
  EVENTOS,
  MEDIOS_EN_RIESGO,
  PERIODO,
  SALUD,
  ZONAS,
} from "../../fixtures"
import {
  baseSalud,
  embudoPanel,
  embudoVacio,
  etapasEmbudo,
  segmentosSalud,
  valoresMapa,
} from "../datos"
import {
  ActividadReciente,
  EsqueletoActividadReciente,
  EVENTOS_VISIBLES,
} from "./actividad-reciente"
import { AlertasPanel, hrefAccesosSospechosos } from "./alertas-panel"
import { DepartamentosPanel } from "./departamentos-panel"
import { GraficoEmbudoPanel } from "./graficos-admin"
import { SaludMedios } from "./salud-medios"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeAll(() => {
  // jsdom no implementa ResizeObserver (Chart.js lo usa en modo responsive).
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string | null) =>
  (texto ?? "").replace(/[\u00a0\u202f]/g, " ")

const ATIPICAS = {
  total: 5,
  desviacion: 3,
  multiplo: 2,
  masAntiguaAt: "2026-09-29T15:00:00Z",
}

describe("AlertasPanel", () => {
  const accesos = {
    total: 7,
    recientes: ACCESOS_SOSPECHOSOS,
    href: hrefAccesosSospechosos(PERIODO),
  }

  it("cada familia de alertas lleva su cifra y su propio enlace", () => {
    render(<AlertasPanel accesos={accesos} atipicas={ATIPICAS} ahora={AHORA} />)

    const seccionAccesos = screen.getByRole("region", {
      name: "Accesos sospechosos en el periodo",
    })
    expect(within(seccionAccesos).getByText("7")).toBeInTheDocument()
    expect(
      within(seccionAccesos).getByRole("link", { name: "Revisar los accesos" })
    ).toHaveAttribute(
      "href",
      "/administracion/accesos?sospechoso=SI&periodo=personalizado&desde=2026-09-06&hasta=2026-10-05"
    )

    const seccionMetricas = screen.getByRole("region", {
      name: "Métricas atípicas por validar",
    })
    expect(within(seccionMetricas).getByText("5")).toBeInTheDocument()
    expect(
      within(seccionMetricas).getByText(/3 se desvían del histórico/)
    ).toBeInTheDocument()
    expect(
      within(seccionMetricas).getByRole("link", {
        name: "Revisar la cola de validación",
      })
    ).toHaveAttribute("href", "/operacion/asignaciones?alerta=metricas")
  })

  it("lista solo los tres accesos más recientes, con quién, dónde y por qué", () => {
    render(<AlertasPanel accesos={accesos} atipicas={null} ahora={AHORA} />)
    const filas = screen.getAllByRole("listitem")
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent("Laura Gómez")
    expect(filas[0]).toHaveTextContent("Moscú, Rusia")
    expect(filas[0]).toHaveTextContent("País inusual")
    expect(filas[1]).toHaveTextContent("Correo sin cuenta")
    expect(filas[2]).toHaveTextContent("Ubicación desconocida")
    expect(screen.queryByText("Cuarta Persona")).not.toBeInTheDocument()
  })

  it("sin alertas lo dice en positivo, según lo que el rol puede ver", () => {
    const { rerender } = render(
      <AlertasPanel
        accesos={{ ...accesos, total: 0, recientes: [] }}
        atipicas={{ ...ATIPICAS, total: 0 }}
        ahora={AHORA}
      />
    )
    expect(screen.getByText("Sin alertas")).toBeInTheDocument()
    expect(
      screen.getByText("Ningún acceso sospechoso ni métrica atípica pendiente.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()

    rerender(
      <AlertasPanel
        accesos={null}
        atipicas={{ ...ATIPICAS, total: 0 }}
        ahora={AHORA}
      />
    )
    expect(
      screen.getByText("Ninguna métrica atípica pendiente de validar.")
    ).toBeInTheDocument()
  })
})

describe("ActividadReciente", () => {
  it("muestra los eventos más recientes y enlaza los que tienen pantalla", () => {
    render(<ActividadReciente eventos={EVENTOS} ahora={AHORA} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(EVENTOS_VISIBLES)
    expect(screen.queryByText("Séptimo evento")).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Editó un usuario/ })
    ).toHaveAttribute("href", "/administracion/usuarios")
    expect(screen.getByText(/Cambió el rol a Operaciones/)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver la bitácora" })
    ).toHaveAttribute("href", "/administracion/auditoria")
  })

  it("sin eventos explica qué aparecerá", () => {
    render(<ActividadReciente eventos={[]} ahora={AHORA} />)
    expect(screen.getByText("Sin actividad reciente")).toBeInTheDocument()
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })

  it("el esqueleto anuncia la carga una sola vez", () => {
    render(<EsqueletoActividadReciente />)
    expect(screen.getAllByRole("status")).toHaveLength(1)
  })
})

describe("SaludMedios", () => {
  it("los cinco segmentos en orden y los tres medios con más GMV en juego", () => {
    const segmentos = segmentosSalud(SALUD)
    render(
      <SaludMedios
        segmentos={segmentos}
        base={baseSalud(segmentos)}
        enRiesgo={MEDIOS_EN_RIESGO}
        ahora={AHORA}
      />
    )
    const lista = screen.getByRole("list", { name: "Segmentos de medios" })
    expect(
      within(lista)
        .getAllByRole("listitem")
        .map((fila) => fila.textContent)
    ).toEqual([
      expect.stringContaining("Activos"),
      expect.stringContaining("Nuevos"),
      expect.stringContaining("En riesgo"),
      expect.stringContaining("Inactivos"),
      expect.stringContaining("Suspendidos"),
    ])
    expect(screen.getByText("Noticias del Huila")).toBeInTheDocument()
    expect(screen.getByText("La Costa Informa")).toBeInTheDocument()
    expect(screen.queryByText("Radio Sabana")).not.toBeInTheDocument()
    expect(screen.getByText(/en juego/)).toBeInTheDocument()
    expect(screen.getByText(/Porcentajes sobre 300 medios/)).toBeInTheDocument()
    // Sin `medios.ver` no hay a dónde ir.
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("con `medios.ver` enlaza la lista de medios en riesgo", () => {
    const segmentos = segmentosSalud(SALUD)
    render(
      <SaludMedios
        segmentos={segmentos}
        base={baseSalud(segmentos)}
        enRiesgo={MEDIOS_EN_RIESGO}
        enlaceRiesgo={"/operacion/medios?segmento=en_riesgo" as Route}
        ahora={AHORA}
      />
    )
    expect(
      screen.getByRole("link", { name: "Ver medios en riesgo" })
    ).toHaveAttribute("href", "/operacion/medios?segmento=en_riesgo")
  })

  it("si el periodo no termina hoy, la lista se rotula «hoy» y no mezcla el GMV del cierre", () => {
    const segmentos = segmentosSalud(SALUD)
    render(
      <SaludMedios
        segmentos={segmentos}
        base={baseSalud(segmentos)}
        enRiesgo={MEDIOS_EN_RIESGO}
        periodoVigente={false}
        ahora={AHORA}
      />
    )
    expect(screen.getByText("En riesgo hoy, con más GMV")).toBeInTheDocument()
    expect(screen.queryByText(/en juego/)).not.toBeInTheDocument()
  })

  it("sin medios verificados muestra el estado vacío, sin porcentajes", () => {
    render(
      <SaludMedios
        segmentos={segmentosSalud([])}
        base={null}
        enRiesgo={[]}
        ahora={AHORA}
      />
    )
    expect(
      screen.getByText("Aún no hay medios verificados")
    ).toBeInTheDocument()
    expect(screen.queryByText(/Porcentajes sobre/)).not.toBeInTheDocument()
  })
})

describe("DepartamentosPanel", () => {
  const props = { zonas: ZONAS, valores: valoresMapa(ZONAS), periodo: PERIODO }

  it("cada fila abre el explorador en su departamento con el mismo periodo", () => {
    render(<DepartamentosPanel {...props} conEnlaces />)
    const ranking = screen.getByRole("list", {
      name: "Departamentos con más GMV",
    })
    const [bogota, antioquia, valle] = within(ranking).getAllByRole("link")
    // Bogotá no tiene municipios que explorar: abre el mapa nacional.
    expect(bogota).toHaveAttribute(
      "href",
      "/analitica/mapa?metrica=gmv&desde=2026-09-06&hasta=2026-10-05"
    )
    expect(antioquia).toHaveAttribute(
      "href",
      "/analitica/mapa?metrica=gmv&nivel=departamental&depto=05&desde=2026-09-06&hasta=2026-10-05"
    )
    expect(valle).toHaveAccessibleName(/Valle del Cauca/)
    expect(
      screen.getByRole("link", { name: "Abrir el explorador" })
    ).toBeInTheDocument()
  })

  it("marca como «Nuevo» el departamento sin negocios en el periodo anterior", () => {
    render(<DepartamentosPanel {...props} conEnlaces={false} />)
    const ranking = screen.getByRole("list", {
      name: "Departamentos con más GMV",
    })
    const filas = within(ranking).getAllByRole("listitem")
    expect(filas[2]).toHaveTextContent("Nuevo")
    // Sin `analitica.mapa` no hay enlaces, ni en las filas ni en el mapa.
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("una variación que redondea a cero no se pinta como caída", () => {
    const zonas = [
      { ...ZONAS[0], variacion: 0.18 },
      { ...ZONAS[1], variacion: -0.1 },
      { ...ZONAS[2], valorAnterior: 38_700_000, variacion: 0.002 },
    ]
    render(<DepartamentosPanel {...props} zonas={zonas} conEnlaces={false} />)
    expect(screen.getByText("↑ +18%")).toHaveClass("text-success")
    expect(screen.getByText("↓ -10%")).toHaveClass("text-destructive")
    const estable = screen.getByText("→ 0%")
    expect(estable).toHaveClass("text-muted-foreground")
    expect(estable).not.toHaveClass("text-destructive")
  })

  it("el nombre accesible de cada fila lleva cifra, participación y variación", () => {
    render(<DepartamentosPanel {...props} conEnlaces />)
    const ranking = screen.getByRole("list", {
      name: "Departamentos con más GMV",
    })
    const [bogota, , valle] = within(ranking).getAllByRole("link")
    expect(bogota).toHaveAccessibleName(
      /^Bogotá, D\. C\.: \$\s?56,1\sM, 24% del total, \+18% frente al periodo anterior\. Abrir en el explorador$/
    )
    expect(valle).toHaveAccessibleName(/sin negocios en el periodo anterior/)
  })

  it("sin negocios explica cuándo aparecerán", () => {
    render(
      <DepartamentosPanel
        zonas={[]}
        valores={{}}
        periodo={PERIODO}
        conEnlaces
      />
    )
    expect(screen.getByText("Sin negocios en el periodo")).toBeInTheDocument()
  })
})

describe("GraficoEmbudoPanel", () => {
  const embudo = (aceptadas: number, verificadas: number, pagadas: number) =>
    embudoPanel(
      etapasEmbudo([
        { etapa: "vistas", orden: 1, cantidad: 3120 },
        { etapa: "aceptadas", orden: 2, cantidad: aceptadas },
        { etapa: "verificadas", orden: 7, cantidad: verificadas },
        { etapa: "pagadas", orden: 8, cantidad: pagadas },
      ])
    )
  const pintar = ({ vistas, ejecucion }: ReturnType<typeof embudo>) =>
    render(
      <TooltipProvider>
        <GraficoEmbudoPanel
          etapas={ejecucion}
          vistas={vistas}
          vacio={embudoVacio(ejecucion)}
        />
      </TooltipProvider>
    )

  it("parte de las aceptadas: las ofertas vistas son contexto, no una etapa", () => {
    pintar(embudo(520, 412, 206))
    const tarjeta = screen.getByRole("region", {
      name: "Embudo de asignaciones",
    })
    // El resumen accesible habla de asignaciones: las vistas no lo son.
    expect(
      within(tarjeta).getByRole("group", {
        name: /De 520 asignaciones en «Aceptadas» a 206 en «Pagadas» \(39,6% del inicio\)/,
      })
    ).toBeInTheDocument()
    const pie = plano(tarjeta.querySelector("footer")?.textContent ?? null)
    expect(pie).toContain("3.120 ofertas vistas por los medios en el periodo.")
    expect(pie).toContain(
      "Donde más se frenan: de verificadas a pagadas avanza el 50,0% (las más recientes siguen en curso)."
    )
  })

  it("sin aceptadas cuenta lo que sí pasó: las vieron y nadie aceptó", () => {
    pintar(embudo(0, 0, 0))
    expect(
      screen.getByText("Sin asignaciones aceptadas en el periodo")
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        (texto) =>
          plano(texto) ===
          "Los medios vieron ofertas 3.120 veces en el periodo, pero aún no aceptaron ninguna."
      )
    ).toBeInTheDocument()
  })
})
