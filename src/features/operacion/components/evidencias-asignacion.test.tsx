import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// Las Server Actions no se ejecutan en jsdom: se sustituyen por espías.
vi.mock("@/features/operacion/actions", () => ({ firmarEvidencias: vi.fn() }))
vi.mock("@/features/validacion/actions", () => ({
  validarEvidencia: vi.fn(),
  validarMetrica: vi.fn(),
  prepararCorreccionMetrica: vi.fn(),
  corregirMetrica: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

import {
  DETALLE_EVIDENCIA_EN_DISPUTA,
  DETALLE_RECHAZO_EN_DISPUTA,
  TEXTO_SE_DECIDE_EN_DISPUTA,
} from "@/features/validacion/decision"
import type { ValidacionEnFicha } from "@/features/validacion/tipos"

import { leerAlerta, SIN_ALERTA } from "../alertas"
import type { CorteMetrica } from "../metricas"
import type { PublicacionEvidencia } from "../tipos"
import { EvidenciasAsignacion } from "./evidencias-asignacion"

const ASIGNACION = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
const DISPUTA = "0192f3a4-5b6c-7d8e-9f01-0000000000d1"

function corte(cambios: Partial<CorteMetrica> = {}): CorteMetrica {
  return {
    id: "0192f3a4-5b6c-7d8e-9f01-0000000000c1",
    publicacionId: "p1",
    corte: "H24",
    fechaCorte: "2026-10-11T15:00:00.000Z",
    alcance: 60_000,
    impresiones: 120_000,
    interacciones: 3_000,
    clics: 10,
    estado: "PENDIENTE",
    alerta: SIN_ALERTA,
    observaciones: null,
    validadaAt: null,
    conImagen: false,
    ...cambios,
  }
}

function publicacion(
  cambios: Partial<PublicacionEvidencia> = {}
): PublicacionEvidencia {
  return {
    id: "p1",
    numero: 1,
    url: "https://www.instagram.com/p/abc123/",
    fechaPublicacion: "2026-10-10T15:00:00.000Z",
    permanenciaHasta: "2026-10-17T15:00:00.000Z",
    permanenciaVerificadaAt: null,
    etiquetaConfirmada: true,
    etiquetaVerificada: false,
    estado: "PENDIENTE",
    validadaAt: null,
    observaciones: null,
    retiradaDetectadaAt: null,
    conImagen: false,
    cortes: [],
    ...cambios,
  }
}

/** OPERACIONES con `disputas.ver`, en una asignación en disputa. */
function enDisputa(
  cambios: Partial<ValidacionEnFicha> = {}
): ValidacionEnFicha {
  return {
    estadoAsignacion: "EN_DISPUTA",
    estadoPrevioDisputa: "PUBLICADA",
    disputaId: DISPUTA,
    evidencias: true,
    metricas: true,
    corregir: false,
    ...cambios,
  }
}

function Ficha({
  publicaciones,
  validacion,
}: {
  publicaciones: PublicacionEvidencia[]
  validacion?: ValidacionEnFicha
}) {
  return (
    <EvidenciasAsignacion
      asignacionId={ASIGNACION}
      plataforma="INSTAGRAM"
      publicaciones={publicaciones}
      cortesRequeridos={["H24"]}
      validacion={validacion}
    />
  )
}

describe("EvidenciasAsignacion · en disputa", () => {
  it("la evidencia pendiente se decide al resolver la disputa (con enlace)", () => {
    render(<Ficha publicaciones={[publicacion()]} validacion={enDisputa()} />)
    const nota = screen.getByRole("note")
    expect(nota).toHaveTextContent(TEXTO_SE_DECIDE_EN_DISPUTA)
    expect(nota).toHaveTextContent(DETALLE_EVIDENCIA_EN_DISPUTA)
    expect(
      within(nota).getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/operacion/disputas/${DISPUTA}`)
    expect(
      screen.queryByRole("button", { name: "Aprobar evidencia" })
    ).not.toBeInTheDocument()
  })

  it("sin `disputas.ver` lo explica sin enlace; sin permiso de validar, nada", () => {
    const { rerender } = render(
      <Ficha
        publicaciones={[publicacion()]}
        validacion={enDisputa({ disputaId: null })}
      />
    )
    expect(
      within(screen.getByRole("note")).queryByRole("link")
    ).not.toBeInTheDocument()
    rerender(
      <Ficha
        publicaciones={[publicacion()]}
        validacion={enDisputa({ evidencias: false })}
      />
    )
    expect(screen.queryByRole("note")).not.toBeInTheDocument()
  })

  it("con todo cargado, el rechazo de un corte espera y aprobarlo sigue", () => {
    render(
      <Ficha
        publicaciones={[publicacion({ estado: "APROBADA", cortes: [corte()] })]}
        validacion={enDisputa({ estadoPrevioDisputa: "METRICAS_CARGADAS" })}
      />
    )
    const grupo = screen.getByRole("group", {
      name: "Validar las métricas de 24 horas",
    })
    expect(
      within(grupo).queryByRole("button", { name: "Rechazar" })
    ).not.toBeInTheDocument()
    expect(within(grupo).getByRole("button", { name: "Aprobar" })).toBeEnabled()
    const nota = screen.getByRole("note")
    expect(nota).toHaveTextContent(DETALLE_RECHAZO_EN_DISPUTA)
    expect(
      within(nota).getByRole("link", { name: "Ver la disputa" })
    ).toHaveAttribute("href", `/operacion/disputas/${DISPUTA}`)
  })
})

describe("EvidenciasAsignacion · alertas", () => {
  it("explica la alerta que tuvo un corte antes de corregirse", () => {
    const corregido = corte({
      alerta: leerAlerta({
        alerta_desviacion: false,
        alerta_multiplo: false,
        detalle_alertas: {
          alcance: 60_000,
          alerta_previa: {
            multiplo: 2,
            seguidores: 40_000,
            alcance: 95_000,
            limite_alcance: 80_000,
            multiplo_superado: true,
          },
        },
      }),
    })
    render(
      <Ficha
        publicaciones={[
          publicacion({ estado: "APROBADA", cortes: [corregido] }),
        ]}
      />
    )
    expect(
      screen.getByRole("img", { name: "Tuvo alerta antes de corregirse" })
    ).toBeInTheDocument()
    const porque = screen.getByRole("region", {
      name: "Tuvo alerta antes de corregirse",
    })
    expect(within(porque).getByRole("heading", { level: 4 })).toBeVisible()
    expect(porque).toHaveTextContent("El alcance (95.000) supera el límite")
  })
})
