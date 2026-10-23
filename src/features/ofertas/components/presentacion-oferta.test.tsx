import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { resumirCupos } from "@/features/operacion/calculos"

import { ID_AVISO_ESTADO_OFERTA } from "../foco"
import { construirHistorial } from "../historial"
import { situacionOferta } from "../presentacion"
import type { FechasOferta, OfertaCompleta } from "../tipos"
import { AvisoEstadoOferta } from "./aviso-estado-oferta"
import { HistorialOferta } from "./historial-oferta"
import { ResumenOferta } from "./resumen-oferta"

const FECHAS: FechasOferta = {
  creadaAt: "2026-10-20T15:00:00.000Z",
  enviadaAt: "2026-10-21T15:00:00.000Z",
  devueltaAt: null,
  publicadaAt: null,
  cuposCompletosAt: null,
  enEjecucionAt: null,
  vencidaAt: null,
  cerradaAt: null,
  canceladaAt: null,
}

function oferta(cambios: Partial<OfertaCompleta> = {}): OfertaCompleta {
  return {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000f1",
    titulo: "Reel de Halloween",
    estado: "EN_REVISION",
    plataforma: "INSTAGRAM",
    formato: "Reel",
    campana: {
      id: "0192f3a4-5b6c-7d8e-9f01-0000000000c1",
      nombre: "Halloween 2026",
      marca: "La Cosecha",
      estado: "ACTIVA",
      fechaInicio: "2026-10-25",
      fechaFin: "2026-11-15",
      presupuestoTotal: 100_000_000,
    },
    anunciante: { id: "a1", nombre: "Supermercados La Cosecha" },
    publicacionesPorMedio: 1,
    permiteMultiplesCupos: false,
    presupuestoMaximo: 4_000_000,
    presupuestoComprometido: 0,
    topePorMedio: 0.15,
    cupos: resumirCupos([
      {
        franjaId: "f2",
        clave: "F2",
        nombre: "50 mil – 100 mil",
        orden: 2,
        totales: 3,
        ocupados: 0,
      },
      {
        franjaId: "f1",
        clave: "F1",
        nombre: "30 mil – 50 mil",
        orden: 1,
        totales: 5,
        ocupados: 0,
      },
    ]),
    ventanaInicio: "2026-11-01T05:00:00.000Z",
    ventanaFin: "2026-11-10T05:00:00.000Z",
    fechaLimiteAceptacion: "2026-10-30T22:00:00.000Z",
    permanenciaDias: 7,
    exclusividadDias: null,
    recargoExclusividad: 1.25,
    cortes: ["D7", "H24"],
    instrucciones: null,
    restricciones: null,
    comentarioModeracion: null,
    fechas: FECHAS,
    segmentacion: {
      departamentos: [{ codigo: "05", nombre: "Antioquia" }],
      municipios: [
        { codigo: "52001", nombre: "Pasto", departamento: "Nariño" },
      ],
      categorias: ["Noticias"],
      seguidoresMinimos: 20_000,
      umbralPlataforma: 30_000,
      seguidoresEfectivos: 30_000,
      excluidos: {
        total: 1,
        medios: [{ id: "m1", nombre: "Radio Sur", municipio: "Ipiales" }],
      },
    },
    historial: [],
    creativos: [],
    ...cambios,
  }
}

describe("ResumenOferta", () => {
  it("muestra segmentación, mínimo efectivo y medios excluidos por nombre", () => {
    render(
      <ResumenOferta
        oferta={oferta()}
        perspectiva="anunciante"
        urgencia={null}
      />
    )
    expect(
      within(screen.getByRole("list", { name: "Territorio" })).getAllByRole(
        "listitem"
      )
    ).toHaveLength(2)
    expect(screen.getByText("Pasto (Nariño)")).toBeInTheDocument()
    expect(screen.getByText("Desde 30.000 seguidores")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Pediste 20.000; se aplica el mínimo de la plataforma (30.000)."
      )
    ).toBeInTheDocument()
    expect(screen.getByText("Radio Sur · Ipiales")).toBeInTheDocument()
  })

  it("sin territorio ni categorías: todo el país y todas las categorías", () => {
    const base = oferta()
    render(
      <ResumenOferta
        oferta={oferta({
          segmentacion: {
            ...base.segmentacion,
            departamentos: [],
            municipios: [],
            categorias: [],
            seguidoresMinimos: null,
            excluidos: { total: 3, medios: null },
          },
        })}
        perspectiva="interno"
        urgencia={null}
      />
    )
    expect(screen.getByText("Todo el país")).toBeInTheDocument()
    expect(screen.getByText("Todas las categorías")).toBeInTheDocument()
    expect(
      screen.getByText("Es el mínimo de la plataforma.")
    ).toBeInTheDocument()
    expect(screen.getByText("3 medios excluidos")).toBeInTheDocument()
  })

  it("presupuesto, tope por medio y cupos por franja en orden", () => {
    render(
      <ResumenOferta
        oferta={oferta()}
        perspectiva="anunciante"
        urgencia={null}
      />
    )
    expect(screen.getByText(/^\$\s?4\.000\.000$/)).toBeInTheDocument()
    // El tope se aplica sobre el total de la campaña ($100 M), no sobre la oferta ($4 M).
    expect(
      screen.getByText(/^15\s?% · hasta \$\s?15\.000\.000 de la campaña$/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /^Sobre su presupuesto total de \$\s?100\.000\.000\. Un cupo por medio\.$/
      )
    ).toBeInTheDocument()
    const claves = screen
      .getAllByText(/^F\d$/)
      .map((elemento) => elemento.textContent)
    expect(claves).toEqual(["F1", "F2"])
    expect(screen.getByText("8 cupos en total")).toBeInTheDocument()
  })

  it("un tope con decimales no se redondea", () => {
    render(
      <ResumenOferta
        oferta={oferta({ topePorMedio: 0.125 })}
        perspectiva="interno"
        urgencia={null}
      />
    )
    expect(
      screen.getByText(/^12,5\s?% · hasta \$\s?12\.500\.000 de la campaña$/)
    ).toBeInTheDocument()
  })

  it("condiciones: cortes ordenados, exclusividad con recargo y la urgencia", () => {
    render(
      <ResumenOferta
        oferta={oferta({ exclusividadDias: 15 })}
        perspectiva="anunciante"
        urgencia={{
          nivel: "proxima",
          tono: "aviso",
          texto: "Vence dentro de 20 horas",
        }}
      />
    )
    expect(screen.getByText("24 horas · 7 días")).toBeInTheDocument()
    expect(
      screen.getByText("15 días · recargo del 25% en el precio")
    ).toBeInTheDocument()
    expect(screen.getByText("Vence dentro de 20 horas")).toBeInTheDocument()
  })

  it("la etiqueta de publicidad siempre es obligatoria", () => {
    render(
      <ResumenOferta
        oferta={oferta()}
        perspectiva="anunciante"
        urgencia={null}
      />
    )
    expect(
      screen.getByText("Etiqueta de publicidad obligatoria.")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Sin instrucciones ni restricciones adicionales.")
    ).toBeInTheDocument()
  })
})

describe("AvisoEstadoOferta", () => {
  it("es una región con el estado como nombre y el comentario destacado", () => {
    const situacion = situacionOferta(
      {
        estado: "DEVUELTA",
        fechas: FECHAS,
        fechaLimiteAceptacion: "2026-10-30T22:00:00.000Z",
        ventanaInicio: "2026-11-01T05:00:00.000Z",
        ventanaFin: "2026-11-10T05:00:00.000Z",
        comentarioModeracion: "Cambia el enlace de destino.",
        ultimoCambio: null,
      },
      "anunciante"
    )
    render(<AvisoEstadoOferta estado="DEVUELTA" situacion={situacion} />)
    const region = screen.getByRole("region", {
      name: "Devuelta con comentarios",
    })
    expect(region).toHaveTextContent("Comentario del equipo AMO")
    expect(region).toHaveTextContent("Cambia el enlace de destino.")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    // Destino del foco tras un cambio de estado: enfocable solo por programa.
    expect(region).toHaveAttribute("id", ID_AVISO_ESTADO_OFERTA)
    expect(region).toHaveAttribute("tabindex", "-1")
  })
})

describe("HistorialOferta", () => {
  it("lista los cambios con actor y comentario", () => {
    const historial = construirHistorial(
      {
        filas: [
          {
            id: "h1",
            desde: "EN_REVISION",
            hacia: "DEVUELTA",
            actorTipo: "ADMIN",
            actorId: "otro",
            actorNombre: null,
            comentario: "Ajusta el copy.",
            at: "2026-10-21T16:00:00.000Z",
          },
        ],
        fechas: FECHAS,
        comentarioModeracion: "Ajusta el copy.",
        ventanaInicio: "2026-11-01T05:00:00.000Z",
      },
      { perspectiva: "anunciante", usuarioId: "yo" }
    )
    render(<HistorialOferta historial={historial} />)
    const lista = screen.getByRole("list", { name: "Cambios de la oferta" })
    const elementos = within(lista).getAllByRole("listitem")
    expect(elementos).toHaveLength(2)
    expect(elementos[0]).toHaveTextContent("Creada como borrador")
    expect(elementos[1]).toHaveTextContent("Devuelta con comentarios")
    expect(elementos[1]).toHaveTextContent("Equipo AMO")
    expect(elementos[1]).toHaveTextContent("Ajusta el copy.")
  })

  it("avisa cuando el historial se reconstruyó con las fechas", () => {
    render(
      <HistorialOferta
        historial={construirHistorial(
          {
            filas: [],
            fechas: FECHAS,
            comentarioModeracion: null,
            ventanaInicio: "2026-11-01T05:00:00.000Z",
          },
          { perspectiva: "interno", usuarioId: "yo" }
        )}
      />
    )
    expect(
      screen.getByText(/anterior al historial detallado/)
    ).toBeInTheDocument()
  })
})
