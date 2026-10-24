import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/operacion/asignaciones/a1",
  useRouter: () => ({ push: vi.fn() }),
}))
// La evidencia (validación) firma capturas con Server Actions: aquí no se pinta.
vi.mock("./evidencias-asignacion", () => ({ EvidenciasAsignacion: () => null }))

import type { EstadoAsignacion } from "../estados"
import { ID_AVISO_ESTADO_ASIGNACION } from "../foco"
import { leerAlerta } from "../alertas"
import type { AsignacionDetalle, PublicacionEvidencia } from "../tipos"
import {
  CabeceraAsignacion,
  DisputasAsignacion,
  type EnlacesAsignacion,
} from "./ficha-asignacion"

const DISPUTA = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"
const TODOS: EnlacesAsignacion = {
  medio: true,
  campana: true,
  anunciante: true,
  disputas: true,
}

function publicacion(
  cortes: PublicacionEvidencia["cortes"]
): PublicacionEvidencia {
  return {
    id: "p1",
    numero: 1,
    url: "https://www.instagram.com/p/abc123/",
    fechaPublicacion: "2026-10-10T15:00:00.000Z",
    permanenciaHasta: "2026-10-17T15:00:00.000Z",
    permanenciaVerificadaAt: null,
    etiquetaConfirmada: true,
    etiquetaVerificada: true,
    estado: "APROBADA",
    validadaAt: "2026-10-11T15:00:00.000Z",
    observaciones: null,
    retiradaDetectadaAt: null,
    conImagen: true,
    actualizadaAt: "2026-10-11T15:00:00.000Z",
    cortes,
  }
}

function asignacion(
  estado: EstadoAsignacion,
  cambios: Partial<AsignacionDetalle> = {}
): AsignacionDetalle {
  return {
    id: "a1",
    estado,
    estadoPrevioDisputa: null,
    plataforma: "INSTAGRAM",
    formato: "Reel",
    slot: 1,
    causa: null,
    causaCancelacion: null,
    motivo: null,
    creadaAt: "2026-10-01T15:00:00.000Z",
    aceptadaAt: "2026-10-01T15:00:00.000Z",
    fechaLimite: "2026-10-12T04:59:59.000Z",
    ventanaInicio: "2026-10-05T05:00:00.000Z",
    ventanaFin: "2026-10-12T04:59:59.000Z",
    medio: { id: "m1", nombre: "Radio Pasto", estado: "VERIFICADO" },
    cuenta: null,
    oferta: { id: "o1", titulo: "Reel de Halloween" },
    campana: { id: "c1", nombre: "Halloween 2026", marca: "La Cosecha" },
    anunciante: { id: "an1", nombre: "Supermercados La Cosecha" },
    descargas: 1,
    ultimaDescargaAt: null,
    precio: {
      franja: "F2",
      seguidoresAlAceptar: 40_000,
      tarifaBase: 300_000,
      publicaciones: 1,
      multiplicadorCalidad: 1,
      multiplicadorGeografico: 1,
      multiplicadorExclusividad: 1,
      montoBruto: 300_000,
      montos: null,
    },
    progreso: { pasos: [], desenlace: null },
    eventos: [],
    conBitacora: false,
    publicaciones: [],
    cortesRequeridos: ["H24"],
    disputas: [],
    liquidacion: null,
    ...cambios,
  }
}

describe("CabeceraAsignacion", () => {
  it("cancelada por fraude: aviso enfocable con la causa, el motivo y la pérdida del pago", () => {
    render(
      <CabeceraAsignacion
        asignacion={asignacion("CANCELADA", {
          causa: "FRAUDE",
          causaCancelacion: "Fraude",
          motivo: "La captura del panel fue alterada.",
        })}
        enlaces={TODOS}
      />
    )
    const aviso = screen.getByRole("region", {
      name: "Cancelada por AMO · Fraude",
    })
    expect(aviso).toHaveAttribute("id", ID_AVISO_ESTADO_ASIGNACION)
    expect(aviso).toHaveAttribute("tabindex", "-1")
    expect(aviso).toHaveTextContent("La captura del panel fue alterada.")
    expect(aviso).toHaveTextContent("el medio no recibe el pago")
  })

  it("en disputa: enlaza a la disputa abierta si el rol puede verla", () => {
    const enDisputa = asignacion("EN_DISPUTA", {
      estadoPrevioDisputa: "METRICAS_CARGADAS",
      disputas: [
        {
          id: DISPUTA,
          estado: "ABIERTA",
          motivo: "METRICAS",
          parte: "ANUNCIANTE",
          descripcion: "El alcance no cuadra con la captura.",
          resolucion: null,
          creadaAt: "2026-10-15T15:00:00.000Z",
          resueltaAt: null,
        },
      ],
    })
    const { rerender } = render(
      <CabeceraAsignacion asignacion={enDisputa} enlaces={TODOS} />
    )
    const aviso = screen.getByRole("region", { name: "En disputa" })
    expect(aviso).toHaveTextContent("Estaba en «métricas cargadas»")
    expect(
      within(aviso).getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/operacion/disputas/${DISPUTA}`)

    rerender(
      <CabeceraAsignacion
        asignacion={enDisputa}
        enlaces={{ ...TODOS, disputas: false }}
      />
    )
    expect(
      within(screen.getByRole("region", { name: "En disputa" })).queryByRole(
        "link"
      )
    ).not.toBeInTheDocument()
  })

  it("distingue al medio suspendido y las métricas con alerta por validar", () => {
    const conAlerta = {
      id: "m1",
      publicacionId: "p1",
      corte: "H24" as const,
      fechaCorte: "2026-10-11T15:00:00.000Z",
      alcance: 95_000,
      impresiones: 120_000,
      interacciones: 3_000,
      clics: 10,
      estado: "PENDIENTE" as const,
      alerta: leerAlerta({
        alerta_desviacion: false,
        alerta_multiplo: true,
        detalle_alertas: { seguidores: 40_000, multiplo: 2 },
      }),
      observaciones: null,
      validadaAt: null,
      conImagen: true,
      actualizadaAt: "2026-10-11T16:00:00.000Z",
    }
    render(
      <CabeceraAsignacion
        asignacion={asignacion("EVIDENCIA_VALIDADA", {
          medio: { id: "m1", nombre: "Radio Pasto", estado: "SUSPENDIDO" },
          publicaciones: [
            publicacion([
              conAlerta,
              // Aprobada: ya se revisó, no cuenta.
              { ...conAlerta, id: "m2", estado: "APROBADA" },
              // Corregida por el medio: la alerta previa también cuenta.
              {
                ...conAlerta,
                id: "m3",
                alerta: leerAlerta({
                  alerta_desviacion: false,
                  alerta_multiplo: false,
                  detalle_alertas: {
                    alerta_previa: { multiplo_superado: true },
                  },
                }),
              },
            ]),
          ],
        })}
        enlaces={TODOS}
      />
    )
    expect(screen.getByText("Medio suspendido")).toBeInTheDocument()
    expect(screen.getByText("2 métricas con alerta")).toBeInTheDocument()
    // Sin cambio de estado fuera del camino feliz, no hay aviso.
    expect(
      document.getElementById(ID_AVISO_ESTADO_ASIGNACION)
    ).not.toBeInTheDocument()
  })

  it("pone «Verificar» antes de la gestión en el hueco de acciones", () => {
    render(
      <CabeceraAsignacion
        asignacion={asignacion("METRICAS_CARGADAS")}
        enlaces={TODOS}
        verificar={<button type="button">Verificar</button>}
        acciones={<button type="button">Cancelar asignación</button>}
      />
    )
    expect(
      screen.getAllByRole("button").map((boton) => boton.textContent)
    ).toEqual(["Verificar", "Cancelar asignación"])
  })
})

describe("DisputasAsignacion", () => {
  const conDisputas = asignacion("VERIFICADA", {
    disputas: [
      {
        id: DISPUTA,
        estado: "RESUELTA",
        motivo: "METRICAS",
        parte: "MEDIO",
        descripcion: "Las cifras del corte de 24 h estaban bien.",
        resolucion: "Se verificó con la captura original.",
        creadaAt: "2026-10-15T15:00:00.000Z",
        resueltaAt: "2026-10-16T15:00:00.000Z",
      },
    ],
  })

  it("cada disputa enlaza a su ficha interna con `disputas.ver`", () => {
    render(<DisputasAsignacion asignacion={conDisputas} verDisputas />)
    expect(
      screen.getByRole("link", { name: "Disputa por métricas" })
    ).toHaveAttribute("href", `/operacion/disputas/${DISPUTA}`)
    // Estado y quién la abrió con los textos de la bandeja del equipo.
    expect(screen.getByText("Resuelta")).toHaveAttribute(
      "title",
      "El equipo decidió qué pasa con la asignación."
    )
    expect(screen.getByText(/^Abierta por el medio el/)).toBeInTheDocument()
    expect(
      screen.getByText("Se verificó con la captura original.")
    ).toBeInTheDocument()
  })

  it("sin el permiso queda como texto", () => {
    render(<DisputasAsignacion asignacion={conDisputas} verDisputas={false} />)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText("Disputa por métricas")).toBeInTheDocument()
  })
})
