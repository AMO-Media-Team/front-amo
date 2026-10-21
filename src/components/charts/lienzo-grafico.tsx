"use client"

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useState,
} from "react"

import { cn } from "@/lib/utils"

import { useRegistrarGrafico } from "./contexto-grafico"
import { TablaGrafico } from "./tabla-grafico"
import type {
  DatosAccesibles,
  ElementoLeyenda,
  InstanciaGrafico,
} from "./tipos"
import {
  type EstadoTooltip,
  textoTooltip,
  TooltipVidrio,
} from "./tooltip-vidrio"

/**
 * - `indice`: todas las series visibles en la misma posición (líneas, barras).
 * - `elemento`: un solo elemento de la primera serie (dona, mapa de calor).
 */
export type ModoNavegacion = "indice" | "elemento"

interface LienzoGraficoProps extends DatosAccesibles {
  instancia: RefObject<InstanciaGrafico | null>
  /** Leyenda del gráfico, para dibujarla en la imagen exportada. */
  leyenda?: readonly ElementoLeyenda[]
  /** En pantalla la leyenda va al lado (dona): la imagen hace lo mismo. */
  leyendaAlLado?: boolean
  tooltip: EstadoTooltip | null
  /** `false` si el gráfico muestra el detalle en otro lugar (centro de la dona). */
  mostrarTooltip?: boolean
  /** Cantidad de posiciones navegables con las flechas. */
  posiciones: number
  /**
   * Posiciones por fila en una rejilla (mapa de calor): ↑/↓ saltan una fila
   * y ←/→ una posición. Sin valor, las cuatro flechas avanzan de a una.
   */
  columnas?: number
  modo?: ModoNavegacion
  /** Título de la tabla alternativa (normalmente el del gráfico). */
  tituloTabla?: string
  className?: string
  children: ReactNode
}

function elementosEn(
  grafico: InstanciaGrafico,
  indice: number,
  modo: ModoNavegacion
) {
  if (modo === "elemento") return [{ datasetIndex: 0, index: indice }]
  return grafico.data.datasets
    .map((_, datasetIndex) => ({ datasetIndex, index: indice }))
    .filter(({ datasetIndex }) => grafico.isDatasetVisible(datasetIndex))
}

function activar(
  grafico: InstanciaGrafico,
  indice: number | null,
  modo: ModoNavegacion
) {
  const elementos = indice === null ? [] : elementosEn(grafico, indice, modo)
  grafico.setActiveElements(elementos)
  grafico.tooltip?.setActiveElements(elementos, { x: 0, y: 0 })
  grafico.update()
}

type Movimiento = (actual: number, total: number, fila: number) => number

const TECLAS: Readonly<Record<string, Movimiento>> = {
  ArrowRight: (actual, total) => Math.min(actual + 1, total - 1),
  // Entre filas, en el borde no se mueve (no salta a otra columna).
  ArrowDown: (actual, total, fila) =>
    actual < 0 ? 0 : actual + fila <= total - 1 ? actual + fila : actual,
  ArrowLeft: (actual) => Math.max(actual - 1, 0),
  ArrowUp: (actual, _, fila) =>
    actual < 0 ? 0 : actual - fila >= 0 ? actual - fila : actual,
  Home: () => 0,
  End: (_, total) => total - 1,
}

const INSTRUCCION = "Usa las flechas para recorrer los valores."
const INSTRUCCION_REJILLA =
  "Usa las flechas para recorrer la rejilla: izquierda y derecha dentro de una fila, arriba y abajo entre filas."

/** Siguiente posición activa tras una tecla (`null` si la tecla no navega). */
export function moverConTecla(
  tecla: string,
  actual: number | null,
  total: number,
  columnas = 1
): number | null {
  const mover = TECLAS[tecla]
  if (!mover || total <= 0) return null
  return mover(actual ?? -1, total, Math.max(1, columnas))
}

/**
 * Contenedor común de los lienzos: tamaño (Chart.js exige un padre relativo
 * dedicado), tooltip de vidrio, navegación con flechas que muestra el mismo
 * detalle que el puntero y lo anuncia, y la tabla alternativa oculta.
 */
export function LienzoGrafico({
  instancia,
  leyenda,
  leyendaAlLado,
  tooltip,
  mostrarTooltip = true,
  posiciones,
  columnas,
  modo = "indice",
  resumen,
  tabla,
  tituloTabla = resumen,
  className,
  children,
}: LienzoGraficoProps) {
  const [actual, setActual] = useState<number | null>(null)
  useRegistrarGrafico(instancia, { resumen, tabla }, leyenda, leyendaAlLado)

  function alPulsarTecla(evento: KeyboardEvent<HTMLDivElement>) {
    const grafico = instancia.current
    if (!grafico || posiciones === 0) return
    if (evento.key === "Escape") {
      setActual(null)
      activar(grafico, null, modo)
      return
    }
    const siguiente = moverConTecla(evento.key, actual, posiciones, columnas)
    if (siguiente === null) return
    evento.preventDefault()
    setActual(siguiente)
    activar(grafico, siguiente, modo)
  }

  function alSalir() {
    if (actual === null) return
    setActual(null)
    const grafico = instancia.current
    if (grafico) activar(grafico, null, modo)
  }

  return (
    <div className={cn("relative size-full min-h-0", className)}>
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="gráfico"
        aria-label={`${resumen}. ${columnas ? INSTRUCCION_REJILLA : INSTRUCCION}`}
        onKeyDown={alPulsarTecla}
        onBlur={alSalir}
        className="relative size-full rounded-md outline-none focus-visible:anillo-foco"
      >
        {children}
      </div>
      {mostrarTooltip ? <TooltipVidrio estado={tooltip} /> : null}
      <p aria-live="polite" className="sr-only">
        {actual !== null && tooltip ? textoTooltip(tooltip) : ""}
      </p>
      <TablaGrafico tabla={tabla} titulo={tituloTabla} oculta />
    </div>
  )
}
