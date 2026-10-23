"use client"

import { ChartNoAxesColumn, Info } from "lucide-react"
import { parseAsString, useQueryState, useQueryStates } from "nuqs"
import { type MouseEvent, useId } from "react"
import { flushSync } from "react-dom"

import { TarjetaGrafico } from "@/components/charts/tarjeta-grafico"
import { useTemaGraficos } from "@/components/charts/use-tema-graficos"
import { EstadoVacio } from "@/components/feedback/estado-vacio"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { rutaMiCampana } from "@/features/campanas/rutas"
import { NotasReporte } from "@/features/reportes/components/bloques-reporte"
import { GraficoEspec } from "@/features/reportes/components/grafico-espec"
import { IndicadoresReporte } from "@/features/reportes/components/indicadores-reporte"
import {
  ID_TITULO_SEGUIMIENTO,
  PARAMETRO_ASIGNACION,
} from "@/features/seguimiento/rutas"
import { formatearFechaHora } from "@/lib/format"

import {
  avisoParciales,
  filasDeCorte,
  graficoDeCorte,
  indicadoresEficiencia,
  indicadoresResultados,
  notasMetricas,
} from "../contenido"
import {
  DIMENSION,
  DIMENSIONES,
  type Dimension,
  PARAMETRO_CORTE,
  parseAsDimension,
} from "../dimensiones"
import type { DatosMetricasCampana } from "../tipos"
import { ExportarMetricas } from "./exportar-metricas"
import { TablaCorte } from "./tabla-corte"

const CLASE_GRUPO =
  "max-w-full flex-wrap gap-1 rounded-xl border bg-card/60 p-1 [&>[data-slot=toggle-group-item]]:h-8 [&>[data-slot=toggle-group-item]]:rounded-lg [&>[data-slot=toggle-group-item]]:px-3 [&>[data-slot=toggle-group-item]]:text-xs [&>[data-slot=toggle-group-item]]:data-pressed:bg-primary/12 [&>[data-slot=toggle-group-item]]:data-pressed:text-foreground [&>[data-slot=toggle-group-item]]:data-pressed:font-semibold"

/** Una razón sin denominador (p. ej. sin impresiones) no tiene valor en la campaña. */
const SIN_DATOS = "Sin datos en la campaña"

/** Alto del gráfico según cuántas barras o segmentos dibuja. */
function altoGrafico(dimension: Dimension, filas: number): string {
  if (dimension === "fecha") return "min-h-80"
  if (dimension === "plataforma") return "min-h-72"
  if (filas <= 4) return "min-h-56"
  return filas <= 7 ? "min-h-72" : "min-h-96"
}

/** Lo que el enlace a «Seguimiento» cambia en la URL, como su `href`. */
const PARAMETROS_PESTANA = {
  pestana: parseAsString,
  [PARAMETRO_ASIGNACION]: parseAsString,
}

function esClicConModificador(evento: MouseEvent): boolean {
  return (
    evento.button !== 0 ||
    evento.metaKey ||
    evento.ctrlKey ||
    evento.shiftKey ||
    evento.altKey
  )
}

/**
 * Cambia a «Seguimiento» desde el cliente, como al tocar la pestaña, y le
 * lleva el foco a su título; si el seguimiento aún carga, a la pestaña. El
 * enlace vive en el panel de «Métricas», que Base UI desmonta al cambiar: sin
 * esto el foco caería en el `<body>`.
 */
function irAlSeguimiento(enlace: HTMLElement, cambiar: () => void) {
  const pestanas = enlace.closest<HTMLElement>('[data-slot="tabs"]')
  flushSync(cambiar)
  const destino =
    document.getElementById(ID_TITULO_SEGUIMIENTO) ??
    pestanas?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  destino?.focus()
}

function AvisoParciales({
  texto,
  campanaId,
}: {
  texto: string
  campanaId: string
}) {
  const [, setParametros] = useQueryStates(PARAMETROS_PESTANA)
  return (
    <aside
      aria-label="Resultados parciales"
      className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info/6 p-4 text-[0.8125rem] sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2.5 text-pretty">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        {texto}
      </p>
      <EnlaceBoton
        href={rutaMiCampana(campanaId, "seguimiento")}
        scroll={false}
        onClick={(evento) => {
          // Pestaña o ventana nueva: el `href` sigue siendo el de siempre.
          if (esClicConModificador(evento)) return
          evento.preventDefault()
          irAlSeguimiento(evento.currentTarget, () => {
            void setParametros({
              pestana: "seguimiento",
              [PARAMETRO_ASIGNACION]: null,
            })
          })
        }}
        variant="outline"
        size="sm"
        className="shrink-0 self-start bg-card sm:self-center dark:bg-input/30"
      >
        Ver el seguimiento
      </EnlaceBoton>
    </aside>
  )
}

/**
 * Métricas de la campaña (ANU-012): el consolidado oficial de los negocios
 * verificados (alcance, impresiones, interacciones, reproducciones y clics),
 * las métricas derivadas con su n, el desglose por plataforma, medio,
 * municipio o fecha (`?corte=`) con su gráfico y su tabla, el aviso de
 * resultados parciales y la exportación de marca.
 */
export function PanelMetricas({
  datos,
  puedeExportar,
}: {
  datos: DatosMetricasCampana
  puedeExportar: boolean
}) {
  const [dimension, setDimension] = useQueryState(
    PARAMETRO_CORTE,
    parseAsDimension.withOptions({ scroll: false })
  )
  const idCorte = useId()
  const { reducirMovimiento } = useTemaGraficos()
  const { campana, totales } = datos
  const sinResultados = totales.verificadas === 0
  const aviso = avisoParciales(totales.verificadas, datos.parciales)
  const filas = filasDeCorte(datos, dimension)
  const grafico = graficoDeCorte(datos, dimension)

  return (
    <section aria-labelledby="titulo-metricas" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="titulo-metricas"
            className="font-heading text-lg font-semibold"
          >
            Resultados de la campaña
          </h2>
          <p className="max-w-2xl text-[0.8125rem] text-pretty text-muted-foreground">
            Consolidado de los negocios que el equipo AMO ya verificó: de cada
            publicación cuenta su último corte de métricas aprobado.{" "}
            <span className="cifras">
              Datos al{" "}
              <time dateTime={datos.consultadoAt}>
                {formatearFechaHora(datos.consultadoAt)}
              </time>
              .
            </span>
          </p>
        </div>
        {puedeExportar ? (
          <ExportarMetricas
            campanaId={campana.id}
            dimension={dimension}
            sinResultados={sinResultados}
          />
        ) : null}
      </div>

      {aviso ? <AvisoParciales texto={aviso} campanaId={campana.id} /> : null}

      {sinResultados ? (
        <EstadoVacio
          icono={ChartNoAxesColumn}
          titulo="Aún no hay resultados verificados"
          descripcion="Cuando el equipo AMO verifique la publicación y las métricas de cada medio, aquí verás el alcance, las impresiones, las interacciones y el costo por resultado, por plataforma, medio, municipio y fecha."
        />
      ) : (
        <>
          <section
            aria-labelledby="titulo-resultados"
            className="flex flex-col gap-3"
          >
            <h3 id="titulo-resultados" className="text-sm font-semibold">
              Consolidado
            </h3>
            <IndicadoresReporte
              indicadores={indicadoresResultados(datos)}
              etiquetaComparacion={null}
              textoSinDatos={SIN_DATOS}
            />
          </section>

          <section
            aria-labelledby="titulo-eficiencia"
            className="flex flex-col gap-3"
          >
            <h3 id="titulo-eficiencia" className="text-sm font-semibold">
              Costo por resultado y engagement
            </h3>
            <IndicadoresReporte
              indicadores={indicadoresEficiencia(datos)}
              etiquetaComparacion={null}
              textoSinDatos={SIN_DATOS}
            />
          </section>

          <section
            aria-labelledby="titulo-desglose"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 id="titulo-desglose" className="text-sm font-semibold">
                  Desglose por corte
                </h3>
                <p className="text-[0.8125rem] text-pretty text-muted-foreground">
                  {DIMENSION[dimension].descripcion} Cada fila dice sobre
                  cuántos negocios se calculó (n).
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span
                  id={idCorte}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Ver por
                </span>
                <ToggleGroup
                  aria-labelledby={idCorte}
                  value={[dimension]}
                  onValueChange={(valor) => {
                    const [elegido] = valor
                    // Tocar la opción activa no la desmarca: siempre hay una.
                    if (elegido === undefined) return
                    void setDimension(
                      elegido === "plataforma" ? null : (elegido as Dimension)
                    )
                  }}
                  className={CLASE_GRUPO}
                >
                  {DIMENSIONES.map((opcion) => (
                    <ToggleGroupItem key={opcion} value={opcion}>
                      {DIMENSION[opcion].titulo}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>

            <TarjetaGrafico
              titulo={grafico.titulo}
              descripcion={grafico.descripcion}
              pie={grafico.pie}
              vacio={grafico.vacio}
              alto={altoGrafico(dimension, filas.length)}
              nivelTitulo="h3"
            >
              {grafico.tipo === "mapa" ? null : (
                <GraficoEspec
                  key={`${dimension}-${reducirMovimiento ? "quieto" : "animado"}`}
                  espec={grafico}
                />
              )}
            </TarjetaGrafico>

            <TablaCorte
              dimension={dimension}
              filas={filas}
              totales={totales}
              nMinimo={datos.nMinimo}
            />
          </section>

          <NotasReporte notas={notasMetricas(datos.nMinimo)} />
        </>
      )}
    </section>
  )
}
