"use client"

import "./registro"

import type {
  BorderRadius,
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  ScriptableContext,
  TooltipModel,
} from "chart.js"
import { useCallback, useMemo, useRef } from "react"
import { Chart } from "react-chartjs-2"

import { cn } from "@/lib/utils"

import { datosApiladas } from "./accesibilidad"
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
  retardoEscalonado,
} from "./opciones"
import { colorCategorico, realce } from "./paleta"
import type { ContenidoTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import type { Serie } from "./tipos"
import { useTemaGraficos } from "./use-tema-graficos"

export interface GraficoBarrasApiladasProps {
  titulo: string
  /** Categorías del eje (meses, departamentos…). */
  categorias: readonly string[]
  /** Hasta 8 series; cada una con un valor por categoría. */
  series: readonly Serie[]
  formato: FormatoValor
  orientacion?: "vertical" | "horizontal"
  nombreCategoria?: string
  className?: string
}

type Valores = (number | null)[]
const RADIO = 4
const SEPARACION = 2

/** Índice de la serie visible más externa con valor en esa categoría. */
function ultimaVisibleConValor(
  grafico: ChartJS<"bar", Valores>,
  indice: number
): number {
  for (let d = grafico.data.datasets.length - 1; d >= 0; d--) {
    const valor = grafico.data.datasets[d].data[indice]
    if (grafico.isDatasetVisible(d) && valor !== null && valor !== 0) return d
  }
  return -1
}

function primeraVisibleConValor(
  grafico: ChartJS<"bar", Valores>,
  indice: number
): number {
  return grafico.data.datasets.findIndex(
    (serie, d) =>
      grafico.isDatasetVisible(d) &&
      serie.data[indice] !== null &&
      serie.data[indice] !== 0
  )
}

/**
 * Solo el extremo exterior de la pila se redondea (la base queda recta) y cada
 * segmento se separa del anterior con 2 px del color de la superficie.
 */
function geometriaSegmento(horizontal: boolean) {
  const radio = (contexto: ScriptableContext<"bar">): BorderRadius => {
    const externo =
      ultimaVisibleConValor(
        contexto.chart as ChartJS<"bar", Valores>,
        contexto.dataIndex
      ) === contexto.datasetIndex
    const r = externo ? RADIO : 0
    return horizontal
      ? { topLeft: 0, bottomLeft: 0, topRight: r, bottomRight: r }
      : { topLeft: r, topRight: r, bottomLeft: 0, bottomRight: 0 }
  }
  const borde = (contexto: ScriptableContext<"bar">) => {
    const base =
      primeraVisibleConValor(
        contexto.chart as ChartJS<"bar", Valores>,
        contexto.dataIndex
      ) === contexto.datasetIndex
    const separacion = base ? 0 : SEPARACION
    return horizontal
      ? { left: separacion, top: 0, right: 0, bottom: 0 }
      : { bottom: separacion, top: 0, left: 0, right: 0 }
  }
  return { radio, borde }
}

/**
 * Barras apiladas (parte de un todo por categoría): colores categóricos en
 * orden fijo, leyenda para alternar series y total en el tooltip.
 */
export function GraficoBarrasApiladas({
  titulo,
  categorias,
  series,
  formato,
  orientacion = "vertical",
  nombreCategoria,
  className,
}: GraficoBarrasApiladasProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"bar", Valores, string>>(null)
  const { ocultas, alternar } = useSeriesOcultas()
  const horizontal = orientacion === "horizontal"

  const colores = useMemo(
    () =>
      series.map((_, i) => colorCategorico(i, tema.categorica, tema.atenuado)),
    [series, tema]
  )

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"bar">): ContenidoTooltip | null => {
      const puntos = modelo.dataPoints
      if (!puntos.length) return null
      const total = puntos.reduce(
        (suma, p) => suma + ((horizontal ? p.parsed.x : p.parsed.y) ?? 0),
        0
      )
      return {
        titulo: puntos[0].label,
        // De arriba abajo, como se ven apilados.
        filas: [...puntos].reverse().map((punto) => ({
          id: series[punto.datasetIndex].id,
          color: colores[punto.datasetIndex],
          clave: "bloque" as const,
          valor: formatearValor(
            horizontal ? punto.parsed.x : punto.parsed.y,
            formato
          ),
          etiqueta: series[punto.datasetIndex].nombre,
        })),
        pie: `Total: ${formatearValor(total, formato)}`,
      }
    },
    [series, colores, formato, horizontal]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const datos = useMemo<ChartData<"bar", Valores, string>>(() => {
    const { radio, borde } = geometriaSegmento(horizontal)
    return {
      labels: [...categorias],
      datasets: series.map((serie, i) => ({
        label: serie.id,
        data: [...serie.valores],
        backgroundColor: colores[i],
        hoverBackgroundColor: realce(colores[i], tema.modo),
        borderColor: tema.superficie,
        borderWidth: borde,
        borderSkipped: false,
        borderRadius: radio,
        maxBarThickness: 28,
        categoryPercentage: 0.7,
        hidden: ocultas.has(serie.id),
      })),
    }
  }, [
    categorias,
    series,
    colores,
    tema.superficie,
    tema.modo,
    ocultas,
    horizontal,
  ])

  const opciones = useMemo<ChartOptions<"bar">>(() => {
    const valores = { ...ejeValores(tema, formato), stacked: true }
    const categoriasEje = { ...ejeCategorias(tema), stacked: true }
    return {
      indexAxis: horizontal ? "y" : "x",
      ...densidad(tema),
      animation: animacion(tema),
      animations: tema.reducirMovimiento
        ? undefined
        : { [horizontal ? "x" : "y"]: { delay: retardoEscalonado(26) } },
      interaction: {
        mode: "index",
        axis: horizontal ? "y" : "x",
        intersect: false,
      },
      layout: { padding: { top: 4, right: 8 } },
      scales: horizontal
        ? { x: valores, y: categoriasEje }
        : { x: categoriasEje, y: valores },
      plugins: { tooltip: opcionesTooltip(externo) },
    }
  }, [tema, formato, horizontal, externo])

  const accesibles = useMemo(
    () =>
      datosApiladas({ titulo, categorias, series, formato, nombreCategoria }),
    [titulo, categorias, series, formato, nombreCategoria]
  )

  const leyenda = useMemo<ElementoLeyenda[]>(
    () =>
      series.map((serie, i) => ({
        id: serie.id,
        nombre: serie.nombre,
        color: colores[i],
        marca: "bloque",
      })),
    [series, colores]
  )

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
        posiciones={categorias.length}
        resumen={accesibles.resumen}
        tabla={accesibles.tabla}
        tituloTabla={titulo}
        className="flex-1"
      >
        <Chart
          ref={instancia}
          type="bar"
          data={datos}
          options={opciones}
          aria-hidden
        />
      </LienzoGrafico>
    </div>
  )
}
