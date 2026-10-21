"use client"

import "./registro"

import type {
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  ScriptableContext,
  TooltipModel,
} from "chart.js"
import { useCallback, useMemo, useRef } from "react"
import { Chart } from "react-chartjs-2"

import { formatearDelta } from "@/lib/format"
import { cn } from "@/lib/utils"

import { datosTendencia } from "./accesibilidad"
import { formatearValor, type FormatoValor } from "./formatos"
import {
  type ElementoLeyenda,
  LeyendaGrafico,
  useSeriesOcultas,
} from "./leyenda-grafico"
import { LienzoGrafico } from "./lienzo-grafico"
import {
  animacion,
  densidad,
  ejeCategorias,
  ejeValores,
  opcionesTooltip,
} from "./opciones"
import { colorCategorico, conAlfa } from "./paleta"
import { pluginCruz } from "./plugins"
import type { TemaGraficos } from "./tema"
import type { ContenidoTooltip, FilaTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import type { Serie } from "./tipos"
import { useTemaGraficos } from "./use-tema-graficos"

export interface GraficoTendenciaProps {
  /** Título del gráfico: nombra la serie única y encabeza el resumen aria. */
  titulo: string
  /** Etiquetas del eje X ya formateadas ("12 sept", "Sem 38"). */
  etiquetas: readonly string[]
  series: readonly Serie[]
  /** Mismo indicador en el periodo anterior: línea discontinua atenuada. */
  anterior?: Omit<Serie, "id"> & { id?: string }
  formato: FormatoValor
  /** Relleno degradado bajo la línea (por defecto, si hay una sola serie). */
  area?: boolean
  className?: string
}

const ID_ANTERIOR = "__anterior__"
const PLUGINS = [pluginCruz]

function gradiente(color: string) {
  return ({ chart }: ScriptableContext<"line">) => {
    const { ctx, chartArea } = chart
    if (!chartArea) return conAlfa(color, 0.1)
    const degradado = ctx.createLinearGradient(
      0,
      chartArea.top,
      0,
      chartArea.bottom
    )
    degradado.addColorStop(0, conAlfa(color, 0.26))
    degradado.addColorStop(0.7, conAlfa(color, 0.05))
    degradado.addColorStop(1, conAlfa(color, 0))
    return degradado
  }
}

/** Solo el último punto lleva marcador (≥ 8 px con anillo de superficie). */
function radioFinal(ultimo: number) {
  return ({ dataIndex }: ScriptableContext<"line">) =>
    dataIndex === ultimo ? 4 : 0
}

function construirDatos(
  props: Pick<GraficoTendenciaProps, "etiquetas" | "series" | "anterior">,
  tema: TemaGraficos,
  conArea: boolean,
  ocultas: ReadonlySet<string>
): ChartData<"line", (number | null)[], string> {
  const ultimo = props.etiquetas.length - 1
  const datasets: ChartData<"line", (number | null)[], string>["datasets"] =
    props.series.map((serie, indice) => {
      const color = colorCategorico(indice, tema.categorica, tema.atenuado)
      return {
        label: serie.id,
        data: [...serie.valores],
        borderColor: color,
        backgroundColor: conArea ? gradiente(color) : color,
        fill: conArea ? "origin" : false,
        borderWidth: 2,
        cubicInterpolationMode: "monotone",
        pointRadius: radioFinal(ultimo),
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        pointBorderColor: tema.superficie,
        pointBorderWidth: 2,
        pointHoverBorderWidth: 2,
        pointHitRadius: 12,
        hidden: ocultas.has(serie.id),
        order: indice,
      }
    })
  if (props.anterior) {
    datasets.push({
      label: ID_ANTERIOR,
      data: [...props.anterior.valores],
      borderColor: tema.atenuado,
      backgroundColor: tema.atenuado,
      borderDash: [5, 4],
      borderWidth: 1.5,
      cubicInterpolationMode: "monotone",
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 3,
      pointBackgroundColor: tema.atenuado,
      pointBorderColor: tema.superficie,
      hidden: ocultas.has(ID_ANTERIOR),
      order: props.series.length,
    })
  }
  return { labels: [...props.etiquetas], datasets }
}

/**
 * Tendencia en el tiempo: línea de 2 px (área degradada si es una sola serie),
 * comparativo del periodo anterior en discontinua gris, cruz que sigue al
 * puntero y tooltip con todas las series en esa fecha.
 */
export function GraficoTendencia({
  titulo,
  etiquetas,
  series,
  anterior,
  formato,
  area = series.length === 1,
  className,
}: GraficoTendenciaProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"line", (number | null)[], string>>(null)
  const { ocultas, alternar } = useSeriesOcultas()

  const serieAnterior = useMemo(
    () =>
      anterior
        ? {
            ...anterior,
            id: ID_ANTERIOR,
            nombre: anterior.nombre || "Periodo anterior",
          }
        : undefined,
    [anterior]
  )

  const nombres = useMemo(() => {
    const mapa = new Map(series.map((serie) => [serie.id, serie.nombre]))
    if (serieAnterior) mapa.set(ID_ANTERIOR, serieAnterior.nombre)
    return mapa
  }, [series, serieAnterior])

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"line">): ContenidoTooltip | null => {
      const puntos = modelo.dataPoints
      if (!puntos.length) return null
      const filas: FilaTooltip[] = puntos.map((punto) => {
        const id = String(punto.dataset.label)
        return {
          id,
          color: String(punto.dataset.borderColor),
          clave: id === ID_ANTERIOR ? "discontinua" : "linea",
          valor: formatearValor(punto.parsed.y, formato),
          etiqueta: nombres.get(id) ?? id,
        }
      })
      const actual = puntos.find((p) => p.dataset.label !== ID_ANTERIOR)?.parsed
        .y
      const previo = puntos.find((p) => p.dataset.label === ID_ANTERIOR)?.parsed
        .y
      const variacion =
        series.length === 1 && actual != null && previo
          ? (actual - previo) / Math.abs(previo)
          : null
      return {
        titulo: puntos[0].label,
        filas,
        pie:
          variacion === null
            ? undefined
            : `${formatearDelta(variacion)} frente al periodo anterior`,
      }
    },
    [formato, nombres, series.length]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const datos = useMemo(
    () =>
      construirDatos(
        { etiquetas, series, anterior: serieAnterior },
        tema,
        area,
        ocultas
      ),
    [etiquetas, series, serieAnterior, tema, area, ocultas]
  )

  const opciones = useMemo<ChartOptions<"line">>(
    () => ({
      ...densidad(tema),
      animation: animacion(tema),
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 8 } },
      scales: {
        x: ejeCategorias(tema),
        y: ejeValores(tema, formato),
      },
      plugins: {
        tooltip: opcionesTooltip(externo),
        amoCruz: { color: tema.eje },
      },
    }),
    [tema, formato, externo]
  )

  const accesibles = useMemo(
    () =>
      datosTendencia({
        titulo,
        etiquetas,
        series,
        anterior: serieAnterior,
        formato,
      }),
    [titulo, etiquetas, series, serieAnterior, formato]
  )

  const leyenda = useMemo<ElementoLeyenda[]>(() => {
    const elementos: ElementoLeyenda[] = series.map((serie, indice) => ({
      id: serie.id,
      nombre: serie.nombre,
      color: colorCategorico(indice, tema.categorica, tema.atenuado),
      marca: "linea",
    }))
    if (serieAnterior) {
      elementos.push({
        id: ID_ANTERIOR,
        nombre: serieAnterior.nombre,
        color: tema.atenuado,
        marca: "discontinua",
      })
    }
    return elementos
  }, [series, serieAnterior, tema])

  return (
    <div className={cn("flex size-full min-h-0 flex-col gap-2", className)}>
      {leyenda.length > 1 ? (
        <LeyendaGrafico
          elementos={leyenda}
          ocultos={ocultas}
          onAlternar={alternar}
        />
      ) : null}
      <LienzoGrafico
        instancia={instancia}
        leyenda={leyenda.length > 1 ? leyenda : undefined}
        tooltip={tooltip}
        posiciones={etiquetas.length}
        resumen={accesibles.resumen}
        tabla={accesibles.tabla}
        tituloTabla={titulo}
        className="flex-1"
      >
        <Chart
          ref={instancia}
          type="line"
          data={datos}
          options={opciones}
          plugins={PLUGINS}
          aria-hidden
        />
      </LienzoGrafico>
    </div>
  )
}
