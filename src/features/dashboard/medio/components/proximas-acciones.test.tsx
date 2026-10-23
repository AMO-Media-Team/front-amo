import { act, render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PASO_RELOJ_MS } from "@/components/tiempo/use-ahora"

import { accionesDelInicio, publicacionesPorAsignacion } from "../datos"
import { AHORA_MEDIO, filasAcciones, NEGOCIOS_MEDIO } from "../fixtures"
import { ProximasAcciones } from "./proximas-acciones"

const ACCIONES = accionesDelInicio(filasAcciones(AHORA_MEDIO), {
  ahora: AHORA_MEDIO,
  plazoCargaHoras: 48,
  publicacionesPorAsignacion: publicacionesPorAsignacion(NEGOCIOS_MEDIO),
})

function filas() {
  return within(
    screen.getByRole("list", { name: "Acciones pendientes" })
  ).getAllByRole("listitem")
}

describe("ProximasAcciones", () => {
  // Tras hidratar, la cuenta regresiva sigue el reloj del dispositivo: se fija
  // en `AHORA_MEDIO` para que los plazos no dependan del día de ejecución.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.setSystemTime(AHORA_MEDIO)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("cada acción es un enlace directo a su pantalla, con su plazo", () => {
    render(
      <ProximasAcciones
        acciones={ACCIONES}
        ahoraServidor={AHORA_MEDIO.getTime()}
        enlaceTodas={"/mis-campanas" as Route}
      />
    )
    const [vencida, metrica, nuevaVersion, , bloqueada] = filas()
    expect(filas()).toHaveLength(5)

    const publicar = within(vencida).getByRole("link")
    expect(publicar).toHaveAttribute("href", "/mis-campanas/a1/evidencia")
    // El nombre del enlace dice qué hacer y de qué oferta.
    expect(publicar).toHaveAccessibleName(
      `${ACCIONES[0].etiqueta}: Lanzamiento app Banco Andino`
    )
    expect(vencida).toHaveTextContent(/Venció hace 3 h/)

    expect(within(metrica).getByRole("link")).toHaveAttribute(
      "href",
      "/mis-campanas/a2/metricas?numero=1&corte=H24"
    )
    // 5 h: urgente, y se dice con palabras además del color.
    expect(metrica).toHaveTextContent("Vence en 5 h (urgente)")

    expect(within(nuevaVersion).getByRole("link")).toHaveAttribute(
      "href",
      "/mis-campanas/a3/contenido"
    )

    // El corte de 7 días aún no se habilita: dice cuándo, sin cuenta regresiva.
    expect(bloqueada).toHaveTextContent("Se habilita en 10 h")
    expect(bloqueada).not.toHaveTextContent(/Vence en/)
    expect(within(bloqueada).getByRole("link")).toHaveAttribute(
      "href",
      "/mis-campanas/a5/metricas?numero=2&corte=D7"
    )

    expect(
      screen.getByRole("link", { name: "Ver mis campañas" })
    ).toHaveAttribute("href", "/mis-campanas")
  })

  it("el corte bloqueado se habilita solo cuando llega su hora", () => {
    render(
      <ProximasAcciones
        acciones={ACCIONES.slice(-1)}
        ahoraServidor={AHORA_MEDIO.getTime()}
      />
    )
    expect(filas()[0]).toHaveTextContent("Se habilita en 10 h")
    act(() => {
      vi.setSystemTime(AHORA_MEDIO.getTime() + 10 * 3_600_000)
      vi.advanceTimersByTime(PASO_RELOJ_MS + 100)
    })
    expect(filas()[0]).toHaveTextContent(/Vence en 1 día 23 h/)
  })

  it("sin permiso para ejecutar lleva a la ficha; sin ninguno, solo informa", () => {
    const { unmount } = render(
      <ProximasAcciones
        acciones={ACCIONES.slice(0, 1)}
        ahoraServidor={AHORA_MEDIO.getTime()}
        destino="ficha"
      />
    )
    expect(within(filas()[0]).getByRole("link")).toHaveAttribute(
      "href",
      "/mis-campanas/a1"
    )
    unmount()
    render(
      <ProximasAcciones
        acciones={ACCIONES.slice(0, 1)}
        ahoraServidor={AHORA_MEDIO.getTime()}
        destino={null}
      />
    )
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(filas()[0]).toHaveTextContent("Lanzamiento app Banco Andino")
  })

  it("cuenta lo que no cabe en el panel", () => {
    const { rerender } = render(
      <ProximasAcciones
        acciones={ACCIONES}
        ahoraServidor={AHORA_MEDIO.getTime()}
        restantes={3}
      />
    )
    expect(
      screen.getByText("Y 3 pendientes más en Mis campañas.")
    ).toBeInTheDocument()
    rerender(
      <ProximasAcciones
        acciones={ACCIONES}
        ahoraServidor={AHORA_MEDIO.getTime()}
        restantes={null}
      />
    )
    expect(
      screen.getByText("Tienes más pendientes en Mis campañas.")
    ).toBeInTheDocument()
  })

  it("sin pendientes lo dice en positivo y lleva a las ofertas", () => {
    render(
      <ProximasAcciones
        acciones={[]}
        ahoraServidor={AHORA_MEDIO.getTime()}
        enlaceOfertas={"/ofertas" as Route}
      />
    )
    expect(screen.getByText("Nada pendiente")).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Ver las ofertas de hoy" })
    ).toHaveAttribute("href", "/ofertas")
  })

  it("sin pendientes pero con negocios en curso, explica que esperan revisión", () => {
    render(
      <ProximasAcciones
        acciones={[]}
        ahoraServidor={AHORA_MEDIO.getTime()}
        enlaceOfertas={"/ofertas" as Route}
        enCurso={2}
      />
    )
    expect(
      screen.getByText(/está en revisión del equipo AMO/)
    ).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("reclamar una vencida lleva a su disputa (o a la ficha sin permiso)", () => {
    const [reclamo] = accionesDelInicio(
      [
        {
          asignacionId: "a9",
          ofertaTitulo: "Historia de Halloween",
          accion: "RECLAMAR",
          venceAt: new Date(
            AHORA_MEDIO.getTime() + 30 * 3_600_000
          ).toISOString(),
          numero: null,
          corte: null,
        },
      ],
      { ahora: AHORA_MEDIO, plazoCargaHoras: 48 }
    )
    if (!reclamo) throw new Error("sin acción")
    const { rerender } = render(
      <ProximasAcciones
        acciones={[reclamo]}
        ahoraServidor={AHORA_MEDIO.getTime()}
        puedeReclamar
      />
    )
    const enlace = screen.getByRole("link", {
      name: "Reclama la publicación: Historia de Halloween",
    })
    expect(enlace).toHaveAttribute("href", "/mis-campanas/a9/disputa")
    expect(filas()[0]).toHaveTextContent(/Vence en 1 día 6 h/)

    rerender(
      <ProximasAcciones
        acciones={[reclamo]}
        ahoraServidor={AHORA_MEDIO.getTime()}
      />
    )
    expect(
      screen.getByRole("link", {
        name: "Reclama la publicación: Historia de Halloween",
      })
    ).toHaveAttribute("href", "/mis-campanas/a9")
  })
})
