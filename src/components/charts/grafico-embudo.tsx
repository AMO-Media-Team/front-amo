"use client"

import "./registro"

import type {
  BarElement,
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  Plugin,
  TooltipModel,
} from "chart.js"
import ChartDataLabels, { type Context } from "chartjs-plugin-datalabels"
import { useCallback, useMemo, useRef } from "react"
import { Chart } from "react-chartjs-2"

import { formatearNumero, formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { datosEmbudo } from "./accesibilidad"
import { conversionesEmbudo, type EtapaEmbudo } from "./datos"
import { formatearValor, type Unidad } from "./formatos"
import { LienzoGrafico } from "./lienzo-grafico"
import { animacion, densidad, fuente, opcionesTooltip } from "./opciones"
import { rampaOrdinal, realce, tintaSobre } from "./paleta"
import type { OpcionesConversiones } from "./plugins"
import type { ContenidoTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import { useTemaGraficos } from "./use-tema-graficos"

export interface GraficoEmbudoProps {
  titulo: string
  /** Etapas en orden; la primera es la base del 100 %. */
  etapas: readonly EtapaEmbudo[]
  unidad?: Unidad
  className?: string
}

type Tramo = [number, number]

const UNIDAD_POR_DEFECTO: Unidad = { singular: "registro", plural: "registros" }
const ANCHO_CARACTER = 6.6
const HOLGURA_ETIQUETA = 16

/** Conversión entre etapas, escrita en el hueco entre una barra y la siguiente. */
const pluginConversiones: Plugin<"bar"> = {
  id: "amoConversiones",
  afterDatasetsDraw(grafico, _argumentos, opciones: OpcionesConversiones) {
    const barras = grafico.getDatasetMeta(0).data
    const textos = opciones.textos ?? []
    const { ctx, chartArea } = grafico
    const centro = grafico.scales.x.getPixelForValue(0)
    ctx.save()
    ctx.font = `500 11px ${opciones.fuente ?? "sans-serif"}`
    ctx.fillStyle = opciones.color ?? "#888"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    for (let i = 1; i < barras.length; i++) {
      const texto = textos[i]
      if (!texto) continue
      const y = (barras[i - 1].y + barras[i].y) / 2
      if (y > chartArea.top && y < chartArea.bottom)
        ctx.fillText(texto, centro, y)
    }
    ctx.restore()
  },
}

const PLUGINS = [ChartDataLabels, pluginConversiones]

function anchoBarra(contexto: Context): number {
  const barra = contexto.chart.getDatasetMeta(0).data[contexto.dataIndex] as
    BarElement | undefined
  if (!barra) return 0
  const { x, base } = barra.getProps(["x", "base"], true)
  return x === null || base === null ? 0 : Math.abs(x - base)
}

/**
 * Embudo de etapas: barras centradas con rampa ordinal lila (el orden se lee
 * también en el color), cifra dentro de la barra si cabe y conversión entre
 * etapas en el hueco que las separa.
 */
export function GraficoEmbudo({
  titulo,
  etapas,
  unidad = UNIDAD_POR_DEFECTO,
  className,
}: GraficoEmbudoProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"bar", Tramo[], string>>(null)

  const conConversion = useMemo(() => conversionesEmbudo(etapas), [etapas])
  const colores = useMemo(
    () => rampaOrdinal(etapas.length, tema.ordinal),
    [etapas.length, tema.ordinal]
  )
  // La etapa más grande define el ancho (normalmente la primera).
  const mayor = Math.max(1, ...etapas.map((etapa) => etapa.cantidad))
  const textos = useMemo(
    () =>
      conConversion.map((etapa) =>
        etapa.deLaAnterior === null
          ? ""
          : `↓ ${formatearPorcentaje(etapa.deLaAnterior, 1)}`
      ),
    [conConversion]
  )

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"bar">): ContenidoTooltip | null => {
      const punto = modelo.dataPoints[0]
      if (!punto) return null
      const etapa = conConversion[punto.dataIndex]
      return {
        titulo: etapa.nombre,
        filas: [
          {
            id: etapa.id,
            color: colores[punto.dataIndex],
            clave: "bloque",
            valor: formatearValor(etapa.cantidad, "numero"),
            etiqueta: etapa.cantidad === 1 ? unidad.singular : unidad.plural,
          },
        ],
        pie: [
          etapa.deLaAnterior === null
            ? null
            : `${formatearPorcentaje(etapa.deLaAnterior, 1)} de la etapa anterior`,
          etapa.delInicio === null
            ? null
            : `${formatearPorcentaje(etapa.delInicio, 1)} del inicio`,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    },
    [conConversion, colores, unidad]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const datos = useMemo<ChartData<"bar", Tramo[], string>>(
    () => ({
      labels: conConversion.map((etapa) => etapa.nombre),
      datasets: [
        {
          data: conConversion.map((etapa) => [
            -etapa.cantidad / 2,
            etapa.cantidad / 2,
          ]),
          backgroundColor: colores,
          hoverBackgroundColor: colores.map((color) =>
            realce(color, tema.modo)
          ),
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 32,
          categoryPercentage: 1,
          barPercentage: 0.64,
        },
      ],
    }),
    [conConversion, colores, tema.modo]
  )

  const opciones = useMemo<ChartOptions<"bar">>(() => {
    const semiancho = mayor / 2
    const cabe = (contexto: Context) => {
      const texto = formatearNumero(conConversion[contexto.dataIndex]?.cantidad)
      return (
        anchoBarra(contexto) >= texto.length * ANCHO_CARACTER + HOLGURA_ETIQUETA
      )
    }
    return {
      indexAxis: "y",
      ...densidad(tema),
      animation: animacion(tema, 800),
      interaction: { mode: "index", axis: "y", intersect: false },
      layout: { padding: { right: 8 } },
      scales: {
        // Simétrico: la primera etapa ocupa todo el ancho; las cifras que no
        // caben dentro de una barra van a su derecha, donde siempre hay aire.
        x: { display: false, min: -semiancho * 1.04, max: semiancho * 1.04 },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: tema.texto,
            font: fuente(tema, 12),
            padding: 10,
            autoSkip: false,
          },
        },
      },
      plugins: {
        tooltip: opcionesTooltip(externo),
        amoConversiones: {
          color: tema.textoSecundario,
          fuente: tema.fuente,
          textos,
        },
        datalabels: {
          anchor: (contexto) => (cabe(contexto) ? "center" : "end"),
          align: (contexto) => (cabe(contexto) ? "center" : "end"),
          offset: 6,
          color: (contexto) =>
            cabe(contexto)
              ? tintaSobre(colores[contexto.dataIndex], "#ffffff", "#1b1528")
              : tema.texto,
          font: fuente(tema, 11.5, 600),
          formatter: (_valor, contexto) =>
            formatearNumero(conConversion[contexto.dataIndex]?.cantidad),
        },
      },
    }
  }, [tema, conConversion, colores, textos, mayor, externo])

  const accesibles = useMemo(
    () => datosEmbudo({ titulo, etapas, unidad }),
    [titulo, etapas, unidad]
  )

  return (
    <div className={cn("size-full min-h-0", className)}>
      <LienzoGrafico
        instancia={instancia}
        tooltip={tooltip}
        posiciones={etapas.length}
        resumen={accesibles.resumen}
        tabla={accesibles.tabla}
        tituloTabla={titulo}
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
