import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { formatearCOP } from "@/lib/format"

import { FILTROS_POR_DEFECTO, TAMANO_PAGINA_MARKETPLACE } from "../filtros"
import type { OfertaMarketplace } from "../tipos"
import { FiltrosMarketplace } from "./filtros-marketplace"
import { ListadoOfertas } from "./listado-ofertas"
import { SinElegibilidad } from "./vacio-marketplace"

const AHORA = new Date("2026-10-23T15:00:00.000Z").getTime()

function cop(valor: number): string {
  return formatearCOP(valor).replace(/\s/g, " ")
}

function oferta(cambios: Partial<OfertaMarketplace> = {}): OfertaMarketplace {
  return {
    id: "01a16693-730a-7983-9254-666751ffcd3b",
    titulo: "Historia de Instagram · Convocatoria abierta",
    formato: "Historia",
    plataforma: "INSTAGRAM",
    publicacionesPorMedio: 1,
    permiteMultiplesCupos: false,
    ventanaInicio: "2026-10-24T05:00:00.000Z",
    ventanaFin: "2026-11-05T05:00:00.000Z",
    fechaLimiteAceptacion: "2026-10-25T22:00:00.000Z",
    permanenciaDias: 7,
    exclusividadDias: null,
    cortes: ["H24"],
    marca: "Supermercados La Cosecha",
    anunciante: "La Cosecha SAS",
    anuncianteId: "01a16693-72fe-713c-a45a-70d759c08200",
    rechazada: false,
    vista: false,
    pagoMaximo: 96_000,
    cuentas: [
      {
        cuentaSocialId: "c1",
        handle: "medio.e2e.amo",
        franjaClave: "F1",
        cuposRestantes: 1,
        montoMedio: 96_000,
      },
    ],
    ...cambios,
  }
}

describe("ListadoOfertas", () => {
  it("cada tarjeta: enlace al detalle, pago, cupos, fecha límite y «Nueva»", () => {
    render(
      <ListadoOfertas
        pagina={{ filas: [oferta()], total: 1, pagina: 1 }}
        filtros={FILTROS_POR_DEFECTO}
        ahoraServidor={AHORA}
      />
    )
    const tarjeta = screen.getByRole("article", {
      name: "Historia de Instagram · Convocatoria abierta",
    })
    expect(
      within(tarjeta).getByRole("link", {
        name: "Historia de Instagram · Convocatoria abierta",
      })
    ).toHaveAttribute("href", "/ofertas/01a16693-730a-7983-9254-666751ffcd3b")
    expect(within(tarjeta).getByText("Recibes")).toBeVisible()
    expect(within(tarjeta).getByText(cop(96_000))).toBeVisible()
    expect(within(tarjeta).getByText("Último cupo en tu franja")).toBeVisible()
    expect(within(tarjeta).getByText("Nueva")).toBeVisible()
    expect(within(tarjeta).getByText("Historia de Instagram")).toBeVisible()
    expect(within(tarjeta).getByText(/Cierra en 2 días/)).toBeVisible()
    expect(screen.getByText("1 oferta que puedes aceptar hoy.")).toBeVisible()
  })

  it("marca las rechazadas y con varias cuentas dice «Hasta» y con cuál", () => {
    render(
      <ListadoOfertas
        pagina={{
          filas: [
            oferta({
              vista: true,
              rechazada: true,
              pagoMaximo: 150_000,
              cuentas: [
                {
                  cuentaSocialId: "c2",
                  handle: "otra.cuenta",
                  franjaClave: "F2",
                  cuposRestantes: 3,
                  montoMedio: 150_000,
                },
                {
                  cuentaSocialId: "c1",
                  handle: "medio.e2e.amo",
                  franjaClave: "F1",
                  cuposRestantes: 1,
                  montoMedio: 96_000,
                },
              ],
            }),
          ],
          total: 1,
          pagina: 1,
        }}
        filtros={{ ...FILTROS_POR_DEFECTO, rechazadas: true }}
        ahoraServidor={AHORA}
      />
    )
    const tarjeta = screen.getByRole("article")
    expect(within(tarjeta).getByText("La rechazaste")).toBeVisible()
    expect(within(tarjeta).queryByText("Nueva")).not.toBeInTheDocument()
    expect(within(tarjeta).getByText("Hasta")).toBeVisible()
    expect(
      within(tarjeta).getByText("por 1 publicación con @otra.cuenta")
    ).toBeVisible()
    expect(within(tarjeta).getByText("3 cupos en tu franja")).toBeVisible()
    expect(
      screen.getByText("1 oferta, incluidas las que rechazaste.")
    ).toBeVisible()
  })

  it("pagina con enlaces que conservan los filtros", () => {
    render(
      <ListadoOfertas
        pagina={{
          filas: [oferta()],
          total: TAMANO_PAGINA_MARKETPLACE * 2 + 1,
          pagina: 2,
        }}
        filtros={{ ...FILTROS_POR_DEFECTO, plataforma: "instagram", pagina: 2 }}
        ahoraServidor={AHORA}
      />
    )
    const paginas = within(
      screen.getByRole("navigation", { name: "Páginas de ofertas" })
    )
    expect(paginas.getByRole("link", { name: /Anteriores/ })).toHaveAttribute(
      "href",
      "/ofertas?plataforma=instagram"
    )
    expect(paginas.getByRole("link", { name: /Siguientes/ })).toHaveAttribute(
      "href",
      "/ofertas?plataforma=instagram&pagina=3"
    )
  })

  it("sin ofertas y sin filtros: «Hoy no hay ofertas para ti»", () => {
    render(
      <ListadoOfertas
        pagina={{ filas: [], total: 0, pagina: 1 }}
        filtros={FILTROS_POR_DEFECTO}
        ahoraServidor={AHORA}
      />
    )
    expect(screen.getByText("Hoy no hay ofertas para ti")).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Revisar mis cuentas" })
    ).toHaveAttribute("href", "/mi-medio/cuentas")
  })

  it("sin ofertas por un filtro: ofrece verlas todas", () => {
    render(
      <ListadoOfertas
        pagina={{ filas: [], total: 0, pagina: 1 }}
        filtros={{
          ...FILTROS_POR_DEFECTO,
          plataforma: "tiktok",
          orden: "pago",
        }}
        ahoraServidor={AHORA}
      />
    )
    expect(
      screen.getByText("No hay ofertas de esta plataforma para ti")
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Ver todas las ofertas" })
    ).toHaveAttribute("href", "/ofertas?orden=pago")
  })

  it("«Ver todas las ofertas» quita los filtros y el foco sigue en ellos cuando llega la lista (U7)", async () => {
    const usuario = userEvent.setup()
    const alActualizar = vi.fn<(evento: UrlUpdateEvent) => void>()
    /** Como en la página: la lista del servidor dentro de los filtros. */
    const enFiltros = (lista: ReactNode) => (
      <NuqsTestingAdapter
        searchParams="?plataforma=tiktok&orden=pago"
        onUrlUpdate={alActualizar}
        hasMemory
      >
        <FiltrosMarketplace facetas={null}>{lista}</FiltrosMarketplace>
      </NuqsTestingAdapter>
    )
    const { rerender } = render(
      enFiltros(
        <ListadoOfertas
          pagina={{ filas: [], total: 0, pagina: 1 }}
          filtros={{
            ...FILTROS_POR_DEFECTO,
            plataforma: "tiktok",
            orden: "pago",
          }}
          ahoraServidor={AHORA}
        />
      )
    )

    await usuario.click(
      screen.getByRole("link", { name: "Ver todas las ofertas" })
    )
    // Lo mismo que su `href`, desde el cliente.
    expect(alActualizar.mock.calls.at(-1)?.[0].queryString).toBe("?orden=pago")
    const filtros = screen.getByRole("group", {
      name: "Filtros de las ofertas",
    })
    expect(filtros).toHaveFocus()

    // Llega la lista: el estado vacío (y el enlace) se desmonta.
    rerender(
      enFiltros(
        <ListadoOfertas
          pagina={{ filas: [oferta()], total: 1, pagina: 1 }}
          filtros={{ ...FILTROS_POR_DEFECTO, orden: "pago" }}
          ahoraServidor={AHORA}
        />
      )
    )
    expect(
      screen.queryByRole("link", { name: "Ver todas las ofertas" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("1 oferta que puedes aceptar hoy.")).toBeVisible()
    expect(filtros).toHaveFocus()
  })

  it("sin ofertas por sector, anunciante o días: «con estos filtros» y los quita conservando el orden", () => {
    render(
      <ListadoOfertas
        pagina={{ filas: [], total: 0, pagina: 1 }}
        filtros={{
          ...FILTROS_POR_DEFECTO,
          plataforma: "instagram",
          sector: "01a16693-72fe-713c-a45a-70d759c08300",
          desde: "2026-10-26",
          hasta: "2026-11-01",
          orden: "pago",
        }}
        ahoraServidor={AHORA}
      />
    )
    expect(screen.getByText("No hay ofertas con estos filtros")).toBeVisible()
    expect(screen.getByText(/otros días de publicación/)).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Ver todas las ofertas" })
    ).toHaveAttribute("href", "/ofertas?orden=pago")
  })

  it("una página que ya no existe lleva a la primera", () => {
    render(
      <ListadoOfertas
        pagina={{ filas: [], total: 0, pagina: 4 }}
        filtros={{ ...FILTROS_POR_DEFECTO, pagina: 4 }}
        ahoraServidor={AHORA}
      />
    )
    expect(
      screen.getByRole("link", { name: "Ir a la primera página" })
    ).toHaveAttribute("href", "/ofertas")
  })
})

describe("SinElegibilidad (MED-008 c2)", () => {
  it("muestra el motivo de la BD y el enlace para resolverlo", () => {
    render(
      <SinElegibilidad
        elegibilidad={{
          motivo: "MEDIO_SUSPENDIDO",
          detalle:
            "Tu medio está suspendido: mientras tanto no verás ofertas nuevas.",
        }}
      />
    )
    expect(screen.getByText("Tu medio está suspendido")).toBeVisible()
    expect(
      screen.getByText(
        "Tu medio está suspendido: mientras tanto no verás ofertas nuevas."
      )
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Ver el estado de mi medio" })
    ).toHaveAttribute("href", "/mi-medio")
  })

  it("sin detalle usa el texto propio del motivo", () => {
    render(
      <SinElegibilidad
        elegibilidad={{ motivo: "SIN_CUENTA_VIGENTE", detalle: null }}
      />
    )
    expect(
      screen.getByText(
        "Ninguna de tus cuentas tiene la verificación de seguidores al día."
      )
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Ir a mis cuentas" })
    ).toHaveAttribute("href", "/mi-medio/cuentas")
  })
})
