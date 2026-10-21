"use client"

import "./registro"

import type {
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  TooltipModel,
} from "chart.js"
import { useCallback, useMemo, useRef, useState } from "react"
import { Chart } from "react-chartjs-2"

import {
  type FormatoNumero,
  NumeroAnimado,
} from "@/components/motion/numero-animado"
import { formatearPorcentaje } from "@/lib/format"
import { cn } from "@/lib/utils"

import { datosDona } from "./accesibilidad"
import { type ElementoValor, ID_OTROS, prepararSegmentos } from "./datos"
import { formatearValor, type FormatoValor } from "./formatos"
import {
  type ElementoLeyenda,
  LeyendaGrafico,
  useSeriesOcultas,
} from "./leyenda-grafico"
import { LienzoGrafico } from "./lienzo-grafico"
import { densidad, opcionesTooltip } from "./opciones"
import { colorCategorico, conAlfa } from "./paleta"
import { pluginCentro } from "./plugins"
import type { ContenidoTooltip } from "./tooltip-vidrio"
import { useTooltipGrafico } from "./tooltip-vidrio"
import { useTemaGraficos } from "./use-tema-graficos"

export interface GraficoDonaProps {
  titulo: string
  /** En orden estable (el color sigue a la entidad); máximo 6 visibles. */
  segmentos: readonly ElementoValor[]
  formato: FormatoValor
  etiquetaTotal?: string
  nombreCategoria?: string
  maximo?: number
  className?: string
}

/** El centro usa la variante compacta: cabe en el hueco de la dona. */
const PLUGINS = [pluginCentro]

/** Formato del total pintado en el lienzo (capturas): el mismo, compacto. */
const FORMATO_TEXTO_CENTRO: Readonly<Record<FormatoValor, FormatoValor>> = {
  cop: "copCompacto",
  copCompacto: "copCompacto",
  numero: "compacto",
  compacto: "compacto",
  porcentaje: "porcentaje",
  decimal: "decimal",
}

const FORMATO_CENTRO: Readonly<Record<FormatoValor, FormatoNumero>> = {
  cop: "copCompacto",
  copCompacto: "copCompacto",
  numero: "compacto",
  compacto: "compacto",
  porcentaje: "porcentaje",
  decimal: "numero",
}

/** Opacidad de los segmentos que no están enfocados. */
const ALFA_ATENUADO = 0.28

/** Lado de la dona: todo el alto, hasta el 44 % del ancho y 15 rem. */
const LADO_DONA = "min(100cqh, 44cqw, 15rem)"
/** La cifra central escala con la dona (14–26 px). */
const TAMANO_CENTRO = `clamp(0.875rem, calc(${LADO_DONA} * 0.105), 1.625rem)`

/**
 * Dona de participación (≤ 6 segmentos, el resto en "Otros"): total animado en
 * el centro, que pasa a mostrar el segmento resaltado; la leyenda alterna y
 * resalta segmentos y muestra cifra y participación.
 */
export function GraficoDona({
  titulo,
  segmentos,
  formato,
  etiquetaTotal = "Total",
  nombreCategoria,
  maximo = 6,
  className,
}: GraficoDonaProps) {
  const tema = useTemaGraficos()
  const instancia = useRef<ChartJS<"doughnut", number[], string>>(null)
  const { ocultas, alternar } = useSeriesOcultas()
  const [resaltado, setResaltado] = useState<string | null>(null)

  const visibles = useMemo(
    () => prepararSegmentos(segmentos, maximo),
    [segmentos, maximo]
  )
  const colores = useMemo(
    () =>
      visibles.map((s, i) =>
        s.id === ID_OTROS
          ? tema.atenuado
          : colorCategorico(i, tema.categorica, tema.atenuado)
      ),
    [visibles, tema]
  )
  const total = useMemo(
    () =>
      visibles.reduce((suma, s) => suma + (ocultas.has(s.id) ? 0 : s.valor), 0),
    [visibles, ocultas]
  )

  const construirTooltip = useCallback(
    (modelo: TooltipModel<"doughnut">): ContenidoTooltip | null => {
      const punto = modelo.dataPoints[0]
      if (!punto) return null
      const segmento = visibles[punto.dataIndex]
      return {
        titulo: segmento.nombre,
        filas: [
          {
            id: segmento.id,
            color: colores[punto.dataIndex],
            clave: "bloque",
            valor: formatearValor(segmento.valor, formato),
            etiqueta:
              total > 0
                ? `${formatearPorcentaje(segmento.valor / total, 1)} del total`
                : "",
          },
        ],
      }
    },
    [visibles, colores, formato, total]
  )
  const { tooltip, externo } = useTooltipGrafico(construirTooltip)

  const enfocado =
    visibles.find((s) => s.id === resaltado) ??
    visibles.find((s) => s.id === tooltip?.filas[0]?.id)
  const idEnfocado = enfocado && !ocultas.has(enfocado.id) ? enfocado.id : null

  const datos = useMemo<ChartData<"doughnut", number[], string>>(() => {
    // Énfasis: con un segmento enfocado, el resto se atenúa (la identidad
    // sigue en la leyenda, que no cambia).
    const relleno = visibles.map((s, i) =>
      idEnfocado && s.id !== idEnfocado
        ? conAlfa(colores[i], ALFA_ATENUADO)
        : colores[i]
    )
    return {
      labels: visibles.map((s) => s.nombre),
      datasets: [
        {
          data: visibles.map((s) => (ocultas.has(s.id) ? 0 : s.valor)),
          backgroundColor: relleno,
          hoverBackgroundColor: relleno,
          borderColor: tema.superficie,
          hoverBorderColor: tema.superficie,
          borderWidth: 2,
          borderRadius: 4,
          hoverOffset: 6,
        },
      ],
    }
  }, [visibles, colores, ocultas, tema.superficie, idEnfocado])

  const opciones = useMemo<ChartOptions<"doughnut">>(
    () => ({
      cutout: "72%",
      layout: { padding: 8 },
      ...densidad(tema),
      animation: tema.reducirMovimiento
        ? false
        : {
            duration: 800,
            easing: "easeOutQuart",
            animateRotate: true,
            animateScale: false,
          },
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        tooltip: opcionesTooltip(externo),
        amoCentro: {
          mostrar: tema.captura,
          etiqueta: etiquetaTotal,
          valor: formatearValor(total, FORMATO_TEXTO_CENTRO[formato]),
          color: tema.texto,
          colorSecundario: tema.textoSecundario,
          fuente: tema.fuente,
        },
      },
    }),
    [tema, externo, etiquetaTotal, total, formato]
  )

  const resaltar = useCallback(
    (id: string | null) => {
      setResaltado(id)
      const grafico = instancia.current
      if (!grafico) return
      const indice = id === null ? -1 : visibles.findIndex((s) => s.id === id)
      grafico.setActiveElements(
        indice >= 0 && !ocultas.has(id ?? "")
          ? [{ datasetIndex: 0, index: indice }]
          : []
      )
      grafico.update()
    },
    [visibles, ocultas]
  )

  // El centro muestra el segmento enfocado (si sigue visible) o el total.
  const centro = idEnfocado ? enfocado : undefined
  const valorCentro = centro?.valor ?? total
  const etiquetaCentro = centro?.nombre ?? etiquetaTotal
  const participacionCentro = centro && total > 0 ? centro.valor / total : null

  const accesibles = useMemo(
    () => datosDona({ titulo, segmentos: visibles, formato, nombreCategoria }),
    [titulo, visibles, formato, nombreCategoria]
  )

  const leyenda = useMemo<ElementoLeyenda[]>(
    () =>
      visibles.map((s, i) => ({
        id: s.id,
        nombre: s.nombre,
        color: colores[i],
        marca: "bloque",
        valor:
          total > 0 && !ocultas.has(s.id)
            ? formatearPorcentaje(s.valor / total, 1)
            : "—",
      })),
    [visibles, colores, total, ocultas]
  )

  return (
    // Contenedor de tamaño: la dona se ajusta al alto y al ancho disponibles
    // y la leyenda siempre queda al lado, sin desbordar la tarjeta.
    <div className={cn("[container-type:size] size-full min-h-0", className)}>
      {/* Grupo centrado y leyenda acotada: en tarjetas anchas la cifra no
          se aleja de su nombre. */}
      <div className="flex size-full items-center justify-center gap-4 sm:gap-6">
        <div
          className="relative aspect-square shrink-0"
          style={{ width: LADO_DONA }}
        >
          <LienzoGrafico
            instancia={instancia}
            leyenda={leyenda}
            leyendaAlLado
            tooltip={tooltip}
            mostrarTooltip={false}
            posiciones={visibles.length}
            modo="elemento"
            resumen={accesibles.resumen}
            tabla={accesibles.tabla}
            tituloTabla={titulo}
          >
            <Chart
              ref={instancia}
              type="doughnut"
              data={datos}
              options={opciones}
              plugins={PLUGINS}
              aria-hidden
            />
          </LienzoGrafico>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[20%] flex flex-col items-center justify-center text-center"
          >
            <span className="max-w-full truncate text-[0.6875rem] font-medium text-muted-foreground">
              {etiquetaCentro}
            </span>
            <span
              className="font-heading leading-tight font-semibold tracking-tight"
              style={{ fontSize: TAMANO_CENTRO }}
            >
              <NumeroAnimado
                valor={valorCentro}
                formato={FORMATO_CENTRO[formato]}
              />
            </span>
            <span className="h-4 text-[0.6875rem] text-muted-foreground">
              {participacionCentro === null
                ? ""
                : `${formatearPorcentaje(participacionCentro, 1)} del total`}
            </span>
          </div>
        </div>
        <LeyendaGrafico
          elementos={leyenda}
          ocultos={ocultas}
          onAlternar={alternar}
          onResaltar={resaltar}
          orientacion="vertical"
          className="max-h-full max-w-72 min-w-0 flex-1 overflow-y-auto"
        />
      </div>
    </div>
  )
}
