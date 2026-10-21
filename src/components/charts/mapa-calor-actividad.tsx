"use client"

import "./registro"

import type {
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  ScriptableContext,
  TooltipModel,
} from "chart.js"
import type { MatrixDataPoint } from "chartjs-chart-matrix"
import { useCallback, useMemo, useRef } from "react"
import { Chart } from "react-chartjs-2"

import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { datosMapaCalor } from "./accesibilidad"
import {
  type CeldaActividad,
  completarMatriz,
  DIAS_CORTOS,
  DIAS_SEMANA,
  franjaHoraria,
} from "./datos"
import type { Unidad } from "./formatos"
import { LienzoGrafico } from "./lienzo-grafico"
import { animacion, densidad, fuente, opcionesTooltip } from "./opciones"
import { claseSecuencial, limitesClases, rangosClases } from "./paleta"
import type { ElementoLeyenda } from "./tipos"
import type { ContenidoTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import { useTemaGraficos } from "./use-tema-graficos"

export interface MapaCalorActividadProps {
  titulo: string
  /** Filas de `actividad_heatmap` (1 = lunes, hora 0–23 de Bogotá). */
  celdas: readonly CeldaActividad[]
  unidad: Unidad
  className?: string
}

interface PuntoMatriz extends MatrixDataPoint {
  x: string
  y: string
  v: number
}

const HORAS = Array.from({ length: 24 }, (_, hora) => String(hora))
const SEPARACION = 2

/**
 * Mapa de calor día × hora (chartjs-chart-matrix): escala secuencial lila en
 * cinco clases con leyenda, celdas separadas 2 px y "sin actividad" en un
 * neutro distinto de la primera clase.
 */
export function MapaCalorActividad({
  titulo,
  celdas,
  unidad,
  className,
}: MapaCalorActividadProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"matrix", PuntoMatriz[], string>>(null)

  const matriz = useMemo(() => completarMatriz(celdas), [celdas])
  const maximo = useMemo(
    () => Math.max(0, ...matriz.map((c) => c.cantidad)),
    [matriz]
  )
  const limites = useMemo(
    () => limitesClases(maximo, tema.secuencial.length),
    [maximo, tema.secuencial.length]
  )
  const leyendaEscala = useMemo(
    () => leyendaDeEscala(tema.secuencial, tema.vacio, limites),
    [tema.secuencial, tema.vacio, limites]
  )

  const color = useCallback(
    (valor: number) => {
      const clase = claseSecuencial(valor, maximo, tema.secuencial.length)
      return clase < 0 ? tema.vacio : tema.secuencial[clase]
    },
    [maximo, tema]
  )

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"matrix">): ContenidoTooltip | null => {
      const punto = modelo.dataPoints[0]
      if (!punto) return null
      const celda = matriz[punto.dataIndex]
      return {
        titulo: `${DIAS_SEMANA[celda.diaSemana - 1]} · ${franjaHoraria(celda.hora)}`,
        filas: [
          {
            id: `${celda.diaSemana}-${celda.hora}`,
            color: color(celda.cantidad),
            clave: "bloque",
            valor: formatearNumero(celda.cantidad),
            etiqueta: celda.cantidad === 1 ? unidad.singular : unidad.plural,
          },
        ],
      }
    },
    [matriz, color, unidad]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const datos = useMemo<ChartData<"matrix", PuntoMatriz[], string>>(
    () => ({
      datasets: [
        {
          label: titulo,
          data: matriz.map((c) => ({
            x: String(c.hora),
            y: DIAS_CORTOS[c.diaSemana - 1],
            v: c.cantidad,
          })),
          backgroundColor: ({ raw }: ScriptableContext<"matrix">) =>
            color((raw as PuntoMatriz).v),
          hoverBackgroundColor: ({ raw }: ScriptableContext<"matrix">) =>
            color((raw as PuntoMatriz).v),
          hoverBorderColor: tema.texto,
          hoverBorderWidth: 1.5,
          borderRadius: 3,
          width: ({ chart }: ScriptableContext<"matrix">) =>
            Math.max(1, (chart.chartArea?.width ?? 0) / 24 - SEPARACION),
          height: ({ chart }: ScriptableContext<"matrix">) =>
            Math.max(1, (chart.chartArea?.height ?? 0) / 7 - SEPARACION),
        },
      ],
    }),
    [matriz, color, titulo, tema.texto]
  )

  const opciones = useMemo<ChartOptions<"matrix">>(
    () => ({
      ...densidad(tema),
      animation: animacion(tema, 600),
      interaction: { mode: "nearest", intersect: true },
      layout: { padding: { right: 2 } },
      scales: {
        x: {
          type: "category",
          labels: HORAS,
          offset: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: tema.textoSecundario,
            font: fuente(tema, 10.5),
            autoSkip: false,
            maxRotation: 0,
            padding: 4,
            callback: (_valor, indice) =>
              indice % 3 === 0 ? `${indice} h` : "",
          },
        },
        y: {
          type: "category",
          labels: [...DIAS_CORTOS],
          offset: true,
          reverse: false,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: tema.textoSecundario,
            font: fuente(tema, 11),
            padding: 6,
          },
        },
      },
      plugins: { tooltip: opcionesTooltip(externo) },
    }),
    [tema, externo]
  )

  const accesibles = useMemo(
    () => datosMapaCalor({ titulo, celdas: matriz, unidad }),
    [titulo, matriz, unidad]
  )

  return (
    <div className={cn("flex size-full min-h-0 flex-col gap-3", className)}>
      <LienzoGrafico
        instancia={instancia}
        leyenda={leyendaEscala}
        tooltip={tooltip}
        posiciones={matriz.length}
        columnas={HORAS.length}
        modo="elemento"
        resumen={accesibles.resumen}
        tabla={accesibles.tabla}
        tituloTabla={titulo}
        className="min-h-44 flex-1"
      >
        <Chart
          ref={instancia}
          type="matrix"
          data={datos}
          options={opciones}
          aria-hidden
        />
      </LienzoGrafico>
      <EscalaSecuencial
        colores={tema.secuencial}
        vacio={tema.vacio}
        limites={limites}
        unidad={unidad}
      />
    </div>
  )
}

function etiquetaRango(rango: readonly [number, number] | null): string {
  if (!rango) return "sin casos"
  const [desde, hasta] = rango
  return desde === hasta
    ? formatearNumero(desde)
    : `${formatearNumero(desde)}–${formatearNumero(hasta)}`
}

/** La escala como leyenda (para la imagen exportada, donde no hay HTML). */
function leyendaDeEscala(
  colores: readonly string[],
  vacio: string,
  limites: readonly number[]
): ElementoLeyenda[] {
  if (limites.length === 0) return []
  const rangos = rangosClases(limites)
  return [
    { id: "vacio", nombre: "Sin actividad", color: vacio, marca: "bloque" },
    ...colores.map((color, i) => ({
      id: `clase-${i}`,
      nombre: etiquetaRango(rangos[i]),
      color,
      marca: "bloque" as const,
    })),
  ]
}

function EscalaSecuencial({
  colores,
  vacio,
  limites,
  unidad,
}: {
  colores: readonly string[]
  vacio: string
  limites: readonly number[]
  unidad: Unidad
}) {
  if (limites.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[0.6875rem] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-3 rounded-[3px] ring-1 ring-border ring-inset"
          style={{ backgroundColor: vacio }}
        />
        Sin actividad
      </span>
      <span className="flex items-center gap-1.5">
        <span>Menos</span>
        <span
          className="flex gap-0.5"
          role="img"
          aria-label={`Escala de ${unidad.plural}: de 1 a ${formatearNumero(limites.at(-1))}`}
        >
          {colores.map((colorClase, i) => (
            <span
              key={colorClase}
              title={`${etiquetaRango(rangosClases(limites)[i])} ${unidad.plural}`}
              className="h-3 w-5 rounded-[3px]"
              style={{ backgroundColor: colorClase }}
            />
          ))}
        </span>
        <span>Más</span>
      </span>
    </div>
  )
}
