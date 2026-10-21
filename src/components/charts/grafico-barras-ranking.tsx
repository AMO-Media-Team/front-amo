"use client"

import "./registro"

import type {
  BarElement,
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  TooltipModel,
} from "chart.js"
import ChartDataLabels, { type Context } from "chartjs-plugin-datalabels"
import { useCallback, useMemo, useRef } from "react"
import { Chart } from "react-chartjs-2"

import { formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { datosRanking } from "./accesibilidad"
import { type ElementoValor, ID_OTROS, prepararRanking } from "./datos"
import {
  formatearEtiqueta,
  formatearValor,
  type FormatoValor,
} from "./formatos"
import { LienzoGrafico } from "./lienzo-grafico"
import {
  animacion,
  densidad,
  fuente,
  opcionesTooltip,
  retardoEscalonado,
} from "./opciones"
import type { ContenidoTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import { realce, tintaSobre } from "./paleta"
import { useTemaGraficos } from "./use-tema-graficos"

export interface GraficoBarrasRankingProps {
  titulo: string
  elementos: readonly ElementoValor[]
  formato: FormatoValor
  /** Nombre de la medida en tooltip y tabla ("GMV", "Asignaciones"). */
  nombreValor: string
  nombreCategoria?: string
  limite?: number
  /** Suma lo que queda fuera del top en una barra "Otros" atenuada. */
  agruparResto?: boolean
  /** Énfasis: una entidad en color, el resto en gris de contexto. */
  destacado?: string
  className?: string
}

const PLUGINS = [ChartDataLabels]
const MAXIMO_CARACTERES = 22

function recortar(texto: string): string {
  return texto.length > MAXIMO_CARACTERES
    ? `${texto.slice(0, MAXIMO_CARACTERES - 1)}…`
    : texto
}

const SEPARACION_ETIQUETA = 6

/** ¿La cifra cabe a la derecha de la barra sin salirse del lienzo? */
function cabeFuera(
  contexto: Context,
  texto: string,
  fuenteCss: string
): boolean {
  const { chart, dataIndex } = contexto
  const barra = chart.getDatasetMeta(0).data[dataIndex] as
    BarElement | undefined
  if (!barra) return true
  const { x } = barra.getProps(["x"], true)
  if (x === null) return true
  const lienzo = chart.ctx
  lienzo.save()
  lienzo.font = fuenteCss
  const ancho = lienzo.measureText(texto).width
  lienzo.restore()
  return x + SEPARACION_ETIQUETA + ancho <= chart.width - 2
}

/**
 * Ranking horizontal (top N): barras finas que nacen de una misma base, valor
 * rotulado en la punta (por eso no hay eje de valores) y puesto junto al nombre.
 */
export function GraficoBarrasRanking({
  titulo,
  elementos,
  formato,
  nombreValor,
  nombreCategoria,
  limite = 10,
  agruparResto = false,
  destacado,
  className,
}: GraficoBarrasRankingProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"bar", number[], string>>(null)

  const filas = useMemo(
    () => prepararRanking(elementos, limite, agruparResto),
    [elementos, limite, agruparResto]
  )
  const total = useMemo(
    () => filas.reduce((suma, f) => suma + f.valor, 0),
    [filas]
  )

  const colores = useMemo(
    () =>
      filas.map((fila) => {
        if (fila.id === ID_OTROS) return tema.atenuado
        if (destacado && fila.id !== destacado) return tema.atenuado
        return tema.categorica[0]
      }),
    [filas, destacado, tema]
  )

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"bar">): ContenidoTooltip | null => {
      const punto = modelo.dataPoints[0]
      if (!punto) return null
      const fila = filas[punto.dataIndex]
      const esOtros = fila.id === ID_OTROS
      return {
        titulo: fila.nombre,
        filas: [
          {
            id: fila.id,
            color: colores[punto.dataIndex],
            clave: "bloque",
            valor: formatearValor(fila.valor, formato),
            etiqueta: nombreValor,
          },
        ],
        pie: [
          esOtros ? null : `Puesto ${punto.dataIndex + 1}`,
          total > 0
            ? `${formatearPorcentaje(fila.valor / total, 1)} del total mostrado`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      }
    },
    [filas, colores, formato, nombreValor, total]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const datos = useMemo<ChartData<"bar", number[], string>>(
    () => ({
      labels: filas.map((fila) => fila.nombre),
      datasets: [
        {
          label: nombreValor,
          data: filas.map((fila) => fila.valor),
          backgroundColor: colores,
          hoverBackgroundColor: colores.map((color) =>
            realce(color, tema.modo)
          ),
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 18,
          categoryPercentage: 0.78,
          barPercentage: 1,
        },
      ],
    }),
    [filas, colores, nombreValor, tema.modo]
  )

  const opciones = useMemo<ChartOptions<"bar">>(() => {
    const fuenteCss = `600 11px ${tema.fuente}`
    const fuera = (contexto: Context) =>
      cabeFuera(
        contexto,
        formatearEtiqueta(filas[contexto.dataIndex]?.valor ?? 0, formato),
        fuenteCss
      )
    return {
      indexAxis: "y",
      ...densidad(tema),
      animation: animacion(tema),
      animations: tema.reducirMovimiento
        ? undefined
        : { x: { delay: retardoEscalonado(40) } },
      interaction: { mode: "index", axis: "y", intersect: false },
      layout: { padding: { right: 4 } },
      scales: {
        x: { display: false, beginAtZero: true, grace: "22%" },
        y: {
          grid: { display: false },
          border: { color: tema.eje },
          ticks: {
            color: tema.texto,
            font: fuente(tema, 12),
            padding: 8,
            autoSkip: false,
            callback: (_valor, indice) => {
              const fila = filas[indice]
              if (!fila) return ""
              return fila.id === ID_OTROS
                ? recortar(fila.nombre)
                : `${indice + 1}. ${recortar(fila.nombre)}`
            },
          },
        },
      },
      plugins: {
        tooltip: opcionesTooltip(externo),
        datalabels: {
          // La cifra va en la punta; si no cabe (barra más larga en móvil),
          // entra en la barra con tinta legible sobre su color.
          anchor: "end",
          align: (contexto) => (fuera(contexto) ? "end" : "start"),
          offset: SEPARACION_ETIQUETA,
          clamp: true,
          color: (contexto) =>
            fuera(contexto)
              ? tema.textoSecundario
              : tintaSobre(colores[contexto.dataIndex]),
          font: { ...fuente(tema, 11, 600) },
          formatter: (valor: number) => formatearEtiqueta(valor, formato),
        },
      },
    }
  }, [tema, filas, colores, formato, externo])

  const accesibles = useMemo(
    () =>
      datosRanking({
        titulo,
        elementos: filas,
        formato,
        nombreValor,
        nombreCategoria,
      }),
    [titulo, filas, formato, nombreValor, nombreCategoria]
  )

  return (
    <div className={cn("size-full min-h-0", className)}>
      <LienzoGrafico
        instancia={instancia}
        tooltip={tooltip}
        posiciones={filas.length}
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
