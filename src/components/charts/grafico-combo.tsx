"use client"

import "./registro"

import type {
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  TooltipModel,
} from "chart.js"
import { useCallback, useMemo, useRef } from "react"
import { Chart } from "react-chartjs-2"

import { cn } from "@/lib/utils"

import { datosCombo, type SerieFormateada } from "./accesibilidad"
import { formatearValor } from "./formatos"
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
  fuente,
  maximoConMargen,
  opcionesTooltip,
  rangoConHolgura,
  retardoEscalonado,
} from "./opciones"
import { realce } from "./paleta"
import { pluginCruz } from "./plugins"
import type { TemaGraficos } from "./tema"
import type { ContenidoTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import { useTemaGraficos } from "./use-tema-graficos"

export interface GraficoComboProps {
  titulo: string
  etiquetas: readonly string[]
  /** Magnitud principal en columnas (p. ej. GMV). */
  barras: SerieFormateada
  /** Razón o medida de otra escala en línea (p. ej. take rate). */
  linea: SerieFormateada
  className?: string
}

type Valores = (number | null)[]
const PLUGINS = [pluginCruz]
const EJE_BARRAS = "yBarras"
const EJE_LINEA = "yLinea"

function tituloEje(tema: TemaGraficos, texto: string) {
  return {
    display: true,
    text: texto,
    color: tema.textoSecundario,
    font: fuente(tema, 11, 500),
    padding: { bottom: 2 },
  }
}

/**
 * Columnas + línea con dos escalas **apiladas** (dos bandas que comparten el
 * eje X), nunca superpuestas: dos ejes Y sobre el mismo plano inventan
 * correlaciones (dataviz). Cada banda tiene su propio eje y título.
 */
export function GraficoCombo({
  titulo,
  etiquetas,
  barras,
  linea,
  className,
}: GraficoComboProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"bar" | "line", Valores, string>>(null)
  const { ocultas, alternar } = useSeriesOcultas()
  const [colorBarras, colorLinea] = tema.categorica

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"bar" | "line">): ContenidoTooltip | null => {
      const puntos = modelo.dataPoints
      if (!puntos.length) return null
      return {
        titulo: puntos[0].label,
        // Primero la magnitud (columnas), luego la razón (línea).
        filas: [...puntos]
          .sort((a, b) => a.datasetIndex - b.datasetIndex)
          .map((punto) => {
            const esBarra = punto.dataset.label === barras.id
            const serie = esBarra ? barras : linea
            return {
              id: serie.id,
              color: esBarra ? colorBarras : colorLinea,
              clave: esBarra ? "bloque" : "linea",
              valor: formatearValor(punto.parsed.y, serie.formato),
              etiqueta: serie.nombre,
            }
          }),
      }
    },
    [barras, linea, colorBarras, colorLinea]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const datos = useMemo<ChartData<"bar" | "line", Valores, string>>(
    () => ({
      labels: [...etiquetas],
      datasets: [
        {
          type: "bar" as const,
          label: barras.id,
          data: [...barras.valores],
          yAxisID: EJE_BARRAS,
          backgroundColor: colorBarras,
          hoverBackgroundColor: realce(colorBarras, tema.modo),
          borderRadius: 4,
          borderSkipped: "start" as const,
          maxBarThickness: 24,
          categoryPercentage: 0.72,
          barPercentage: 0.9,
          hidden: ocultas.has(barras.id),
          order: 2,
        },
        {
          type: "line" as const,
          label: linea.id,
          data: [...linea.valores],
          yAxisID: EJE_LINEA,
          borderColor: colorLinea,
          backgroundColor: colorLinea,
          borderWidth: 2,
          cubicInterpolationMode: "monotone" as const,
          pointRadius: ({ dataIndex }: { dataIndex: number }) =>
            dataIndex === etiquetas.length - 1 ? 4 : 0,
          pointHoverRadius: 5,
          pointBorderColor: tema.superficie,
          pointBorderWidth: 2,
          pointHitRadius: 12,
          hidden: ocultas.has(linea.id),
          order: 1,
        },
      ],
    }),
    [
      etiquetas,
      barras,
      linea,
      colorBarras,
      colorLinea,
      tema.superficie,
      tema.modo,
      ocultas,
    ]
  )

  const opciones = useMemo<ChartOptions<"bar" | "line">>(() => {
    const ejeLinea = ejeValores(tema, linea.formato, { maximoMarcas: 3 })
    const ejeBarras = ejeValores(tema, barras.formato, { maximoMarcas: 4 })
    return {
      ...densidad(tema),
      animation: animacion(tema),
      animations: tema.reducirMovimiento
        ? undefined
        : { y: { delay: retardoEscalonado(18) } },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 4, right: 8 } },
      scales: {
        x: ejeCategorias(tema),
        // Las columnas nacen de la línea base del eje X (sin `offset`: en
        // una escala lineal desplaza el cero media marca hacia arriba). El
        // aire entre bandas sale del `offset` de la línea y de un margen
        // sobre la columna más alta, sin marca en ese borde (no sería una
        // cifra redonda): la última marca de las columnas no queda pegada a
        // la primera de la línea.
        [EJE_BARRAS]: {
          ...ejeBarras,
          max: maximoConMargen(barras.valores),
          ticks: { ...ejeBarras.ticks, includeBounds: false },
          position: "left",
          stack: "combo",
          stackWeight: 3,
          title: tituloEje(tema, barras.nombre),
        },
        [EJE_LINEA]: {
          ...ejeLinea,
          beginAtZero: false,
          ...rangoConHolgura(linea.valores),
          position: "left",
          stack: "combo",
          stackWeight: 2,
          offset: true,
          title: tituloEje(tema, linea.nombre),
        },
      },
      plugins: {
        tooltip: opcionesTooltip(externo),
        amoCruz: { color: tema.eje },
      },
    }
  }, [
    tema,
    barras.formato,
    barras.nombre,
    barras.valores,
    linea.formato,
    linea.nombre,
    linea.valores,
    externo,
  ])

  const accesibles = useMemo(
    () => datosCombo({ titulo, etiquetas, barras, linea }),
    [titulo, etiquetas, barras, linea]
  )

  const leyenda = useMemo<ElementoLeyenda[]>(
    () => [
      {
        id: barras.id,
        nombre: barras.nombre,
        color: colorBarras,
        marca: "bloque",
      },
      { id: linea.id, nombre: linea.nombre, color: colorLinea, marca: "linea" },
    ],
    [barras.id, barras.nombre, linea.id, linea.nombre, colorBarras, colorLinea]
  )

  return (
    <div className={cn("flex size-full min-h-0 flex-col gap-2", className)}>
      <LeyendaGrafico
        elementos={leyenda}
        ocultos={ocultas}
        onAlternar={alternar}
      />
      <LienzoGrafico
        instancia={instancia}
        leyenda={leyenda}
        tooltip={tooltip}
        posiciones={etiquetas.length}
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
          plugins={PLUGINS}
          aria-hidden
        />
      </LienzoGrafico>
    </div>
  )
}
