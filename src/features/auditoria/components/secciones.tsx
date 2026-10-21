import "server-only"

import { MousePointerClick } from "lucide-react"

import type { UsuarioSesion } from "@/lib/auth/tipos"
import { formatearNumero } from "@/lib/format"

import {
  cargarPresentacion,
  estadoTablaBitacora,
  filtrosDeEstado,
  firmaFiltros,
  ID_REGISTROS_BITACORA,
} from "../estado-bitacora"
import { cargarPeriodo, etiquetaRango } from "../periodo"
import {
  contarBitacora,
  listarBitacora,
  obtenerEvento,
  opcionesFiltroBitacora,
  resumenBitacora,
  tramoLineaTiempo,
} from "../queries"
import { ProveedorDetalleEvento } from "./contexto-detalle"
import { LineaTiempoBitacora } from "./linea-tiempo-bitacora"
import { MetricasBitacora } from "./metricas-bitacora"
import { SelectorVista } from "./selector-vista"
import { TablaBitacora } from "./tabla-bitacora"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * Secciones de la página que consultan (Server Components). Cada una va en
 * su `<Suspense>` y su límite de error: el encabezado se pinta de inmediato.
 */

export async function SeccionMetricasBitacora({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { rango } = await cargarPeriodo(searchParams)
  return <MetricasBitacora resumen={await resumenBitacora(rango)} />
}

function CabeceraRegistros({
  total,
  periodo,
}: {
  total: number
  periodo: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SelectorVista />
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium cifras text-foreground">
            {formatearNumero(total)}
          </span>{" "}
          {total === 1 ? "evento" : "eventos"} · {periodo}
        </p>
      </div>
      <p className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
        <MousePointerClick className="size-3.5" aria-hidden />
        Abre un evento para ver quién, cuándo y qué cambió
      </p>
    </div>
  )
}

export async function SeccionRegistrosBitacora({
  searchParams,
  usuario,
}: {
  searchParams: SearchParams
  usuario: UsuarioSesion
}) {
  const [estado, { valores, rango }, { vista, evento }] = await Promise.all([
    estadoTablaBitacora.cargar(searchParams),
    cargarPeriodo(searchParams),
    cargarPresentacion(searchParams),
  ])
  const filtros = filtrosDeEstado(estado)
  const periodo = etiquetaRango(rango)

  const [opciones, eventoInicial] = await Promise.all([
    opcionesFiltroBitacora(rango),
    evento ? obtenerEvento(evento, usuario) : null,
  ])

  if (vista === "linea") {
    const [tramo, total] = await Promise.all([
      tramoLineaTiempo(filtros, rango, null, usuario),
      contarBitacora(filtros, rango),
    ])
    return (
      <ProveedorDetalleEvento eventoInicial={eventoInicial}>
        <div
          id={ID_REGISTROS_BITACORA}
          className="flex scroll-mt-20 flex-col gap-4"
        >
          <CabeceraRegistros total={total} periodo={periodo} />
          <LineaTiempoBitacora
            inicial={tramo}
            filtros={filtros}
            periodo={valores}
            opciones={opciones}
            firma={firmaFiltros(filtros, JSON.stringify(valores))}
          />
        </div>
      </ProveedorDetalleEvento>
    )
  }

  const pagina = await listarBitacora(estado, filtros, rango, usuario)
  return (
    <ProveedorDetalleEvento eventoInicial={eventoInicial}>
      <div
        id={ID_REGISTROS_BITACORA}
        className="flex scroll-mt-20 flex-col gap-4"
      >
        <CabeceraRegistros total={pagina.total} periodo={periodo} />
        <TablaBitacora
          filas={pagina.filas}
          total={pagina.total}
          opciones={opciones}
        />
      </div>
    </ProveedorDetalleEvento>
  )
}
