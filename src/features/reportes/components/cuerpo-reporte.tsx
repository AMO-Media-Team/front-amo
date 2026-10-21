import "server-only"

import type { Route } from "next"

import { PanelInsights } from "@/features/dashboard/insights/components/panel-insights"
import type { PeriodoEnlace } from "@/features/geo/rutas"
import { tieneAlgunPermiso } from "@/lib/auth/dal"
import type { UsuarioSesion } from "@/lib/auth/tipos"
import { type PresetRango, serializarRango } from "@/lib/fechas"
import { formatearNumero } from "@/lib/format"

import {
  filtrosPara,
  puedeExportarReporte,
  REPORTES,
  rutaReporte,
  type SlugReporte,
} from "../catalogo"
import { cargarDatosReporte } from "../consultas"
import { contenidoReporte } from "../definiciones"
import {
  cargarFiltros,
  limitarFiltros,
  MENSAJE_PERIODO_EXCEDIDO,
  periodoExcedido,
  serializarFiltros,
  type ValoresFiltros,
} from "../filtros"
import { paginaTablaReporte } from "../pagina-tabla"
import type { DatosReporte } from "../tipos"
import {
  avisoSinMovimiento,
  comparacionBreve,
  sinMovimiento,
  textoSinDatosIndicador,
} from "../vista"
import {
  AvisoSinMovimiento,
  AvisosReporte,
  NotasReporte,
  ResumenFiltros,
} from "./bloques-reporte"
import { GraficosReporte } from "./graficos-reporte"
import { IndicadoresReporte } from "./indicadores-reporte"
import { TablaReporte } from "./tabla-reporte"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function hrefEsteAno(slug: SlugReporte, valores: ValoresFiltros): Route {
  return `${rutaReporte(slug)}${serializarFiltros({
    ...valores,
    periodo: "esteAno",
    desde: null,
    hasta: null,
  })}` as Route
}

/**
 * Cuerpo del reporte para la URL actual: consulta con los filtros (las RPC
 * vuelven a exigir los permisos) y pinta el resultado.
 */
export async function CuerpoReporte({
  reporte,
  usuario,
  searchParams,
}: {
  reporte: SlugReporte
  usuario: UsuarioSesion
  searchParams: SearchParams
}) {
  const { valores, filtros: enUrl } = await cargarFiltros(searchParams)
  // Solo lo que aplica a este reporte y a quien consulta (igual que al exportar).
  const filtros = limitarFiltros(filtrosPara(REPORTES[reporte], usuario), enUrl)
  if (periodoExcedido(REPORTES[reporte], filtros)) {
    // La base lo rechazaría: se explica en lugar de mostrar un error.
    return (
      <AvisoSinMovimiento
        titulo="El periodo es demasiado largo"
        descripcion={MENSAJE_PERIODO_EXCEDIDO}
        accion={{ texto: "Ver este año", href: hrefEsteAno(reporte, valores) }}
      />
    )
  }
  const datos = await cargarDatosReporte(reporte, filtros, usuario)
  return (
    <VistaCuerpoReporte
      // `cargarDatosReporte` ya devuelve los datos de este reporte.
      entrada={{ reporte, datos } as DatosReporte}
      valores={valores}
      preset={filtros.rango.preset}
      periodoExplorador={
        tieneAlgunPermiso(usuario, ["analitica.mapa"])
          ? serializarRango(filtros.rango)
          : null
      }
      conExportacion={puedeExportarReporte(usuario, REPORTES[reporte])}
      searchParams={searchParams}
    />
  )
}

/**
 * Indicadores, hallazgos, gráficos, detalle y notas de un conjunto de datos,
 * armados con las mismas definiciones que la exportación. La tabla de detalle
 * se recorta según su estado en la URL.
 */
async function VistaCuerpoReporte({
  entrada,
  valores,
  preset,
  periodoExplorador,
  conExportacion,
  searchParams,
}: {
  entrada: DatosReporte
  valores: ValoresFiltros
  preset: PresetRango
  /**
   * Con `analitica.mapa`, el periodo con el que el mapa enlaza al explorador
   * geográfico; `null` = sin enlaces.
   */
  periodoExplorador: PeriodoEnlace | null
  /** Quien mira puede exportar: la tabla remite al Excel para el detalle completo. */
  conExportacion: boolean
  searchParams: SearchParams
}) {
  const { reporte } = entrada
  const { vista, tabla, notas } = contenidoReporte(entrada)
  const pagina = await paginaTablaReporte(entrada, searchParams)
  const { contexto } = entrada.datos

  const vacio = sinMovimiento(vista)
  const aviso = vacio ? avisoSinMovimiento(REPORTES[reporte], preset) : null

  return (
    <div className="flex flex-col gap-6">
      <ResumenFiltros filtros={contexto.filtros} consultadoAt={new Date()} />

      {aviso ? (
        <AvisoSinMovimiento
          titulo={aviso.titulo}
          descripcion={aviso.descripcion}
          proximos={vista.graficos.map((grafico) => grafico.titulo)}
          accion={
            aviso.ampliarPeriodo
              ? { texto: "Ver este año", href: hrefEsteAno(reporte, valores) }
              : undefined
          }
        />
      ) : null}

      <section
        aria-labelledby="titulo-indicadores"
        className="flex flex-col gap-3"
      >
        <h2 id="titulo-indicadores" className="sr-only">
          Indicadores
        </h2>
        <IndicadoresReporte
          indicadores={vista.indicadores}
          etiquetaComparacion={comparacionBreve(contexto.comparacion)}
          textoSinDatos={textoSinDatosIndicador(REPORTES[reporte])}
        />
      </section>

      {reporte === "resumen-ejecutivo" && !vacio ? (
        <PanelInsights
          insights={vista.hallazgos}
          titulo="Hallazgos del periodo"
          descripcion="Lo más relevante que cambió frente al periodo anterior, ordenado por prioridad."
        />
      ) : null}

      <AvisosReporte avisos={vista.avisos} />

      {vacio ? null : (
        <GraficosReporte
          graficos={vista.graficos}
          periodoExplorador={periodoExplorador}
        />
      )}

      {/* Sin rol de región: la tabla ya es la región con este mismo nombre. */}
      <div className="flex flex-col gap-3">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-lg font-semibold">
              {tabla.titulo}
            </h2>
            <p className="text-[0.8125rem] text-pretty text-muted-foreground">
              {tabla.descripcion ??
                (conExportacion
                  ? "Busca, filtra y ordena; el Excel trae todas las filas y columnas."
                  : "Busca, filtra y ordena las filas del reporte.")}
            </p>
          </div>
          <p className="text-xs cifras text-muted-foreground">
            {formatearNumero(pagina.totalReporte)}{" "}
            {pagina.totalReporte === 1 ? "fila" : "filas"} en el reporte
          </p>
        </header>
        <TablaReporte pagina={pagina} titulo={tabla.titulo} />
      </div>

      <NotasReporte notas={notas} />
    </div>
  )
}
