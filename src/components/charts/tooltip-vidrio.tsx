"use client"

import type { Chart, ChartType, TooltipModel } from "chart.js"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { cn } from "@/lib/utils"

import type { MarcaSerie } from "./tipos"

/** Clave de la serie en el tooltip: trazo corto, nunca una caja (dataviz). */
export type ClaveSerie = MarcaSerie

export interface FilaTooltip {
  id: string
  color: string
  clave: ClaveSerie
  /** El valor manda: va primero y en negrita. */
  valor: string
  etiqueta: string
}

export interface ContenidoTooltip {
  titulo: string
  filas: readonly FilaTooltip[]
  /** Nota al pie (p. ej. "62 % del total"). */
  pie?: string
}

export interface EstadoTooltip extends ContenidoTooltip {
  /** Punto de anclaje en px, relativo al lienzo. */
  x: number
  y: number
  anchoLienzo: number
  altoLienzo: number
}

type ConstruirContenido<TTipo extends ChartType> = (
  tooltip: TooltipModel<TTipo>,
  grafico: Chart<TTipo>
) => ContenidoTooltip | null

function mismoEstado(a: EstadoTooltip | null, b: EstadoTooltip): boolean {
  return (
    a !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.titulo === b.titulo &&
    a.pie === b.pie &&
    a.filas.length === b.filas.length &&
    a.filas.every(
      (fila, i) =>
        fila.valor === b.filas[i].valor && fila.etiqueta === b.filas[i].etiqueta
    )
  )
}

/**
 * Tooltip propio (HTML) para Chart.js: `externo` va en
 * `plugins.tooltip.external` y `tooltip` se pasa a `<TooltipVidrio>`. El
 * callback es estable, así las opciones memorizadas no cambian por él.
 */
export function useTooltipGrafico<TTipo extends ChartType>(
  construir: ConstruirContenido<TTipo>
) {
  const [tooltip, setTooltip] = useState<EstadoTooltip | null>(null)
  const construirRef = useRef(construir)

  useEffect(() => {
    construirRef.current = construir
  }, [construir])

  const externo = useCallback(
    ({
      chart,
      tooltip: modelo,
    }: {
      chart: Chart<TTipo>
      tooltip: TooltipModel<TTipo>
    }) => {
      const contenido =
        modelo.opacity === 0 ? null : construirRef.current(modelo, chart)
      if (!contenido || contenido.filas.length === 0) {
        setTooltip(null)
        return
      }
      const siguiente: EstadoTooltip = {
        ...contenido,
        x: modelo.caretX,
        y: modelo.caretY,
        anchoLienzo: chart.width,
        altoLienzo: chart.height,
      }
      setTooltip((previo) =>
        mismoEstado(previo, siguiente) ? previo : siguiente
      )
    },
    []
  )

  return { tooltip, externo }
}

function MarcaSerie({ color, clave }: Pick<FilaTooltip, "color" | "clave">) {
  if (clave === "bloque") {
    return (
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="w-3 shrink-0 border-t-2"
      style={{
        borderColor: color,
        borderTopStyle: clave === "discontinua" ? "dashed" : "solid",
      }}
    />
  )
}

/** Lo que se vería en el tooltip, como texto plano (región viva, pruebas). */
export function textoTooltip(contenido: ContenidoTooltip): string {
  const filas = contenido.filas.map((fila) => `${fila.etiqueta}: ${fila.valor}`)
  return [contenido.titulo, ...filas, contenido.pie].filter(Boolean).join(". ")
}

const SEPARACION_TOOLTIP = 14
/** Pasado este punto del ancho, el tooltip prefiere el lado izquierdo. */
const UMBRAL_IZQUIERDA = 0.58

type Ancla = Pick<EstadoTooltip, "x" | "y" | "anchoLienzo" | "altoLienzo">

function acotar(valor: number, maximo: number): number {
  return Math.min(Math.max(valor, 0), Math.max(0, maximo))
}

/**
 * Esquina superior izquierda del tooltip dentro del lienzo: a un lado del
 * punto (el derecho salvo cerca del borde derecho) y centrado en su altura;
 * si no cabe a ningún lado (móvil), encima o debajo del punto. Nunca se sale
 * del ancho del lienzo, así no provoca desplazamiento horizontal.
 */
export function posicionTooltip(
  { x, y, anchoLienzo, altoLienzo }: Ancla,
  caja: { ancho: number; alto: number }
): { left: number; top: number } {
  const derecha = x + SEPARACION_TOOLTIP
  const izquierda = x - SEPARACION_TOOLTIP - caja.ancho
  const cabeDerecha = derecha + caja.ancho <= anchoLienzo
  const cabeIzquierda = izquierda >= 0
  const centrado = acotar(y - caja.alto / 2, altoLienzo - caja.alto)
  const prefiereIzquierda = x > anchoLienzo * UMBRAL_IZQUIERDA

  if (cabeIzquierda && (prefiereIzquierda || !cabeDerecha)) {
    return { left: izquierda, top: centrado }
  }
  if (cabeDerecha) return { left: derecha, top: centrado }
  const encima = y - SEPARACION_TOOLTIP - caja.alto
  return {
    left: acotar(x - caja.ancho / 2, anchoLienzo - caja.ancho),
    top: acotar(
      encima >= 0 ? encima : y + SEPARACION_TOOLTIP,
      altoLienzo - caja.alto
    ),
  }
}

/**
 * Tooltip de vidrio: valor en negrita primero, serie después con su trazo.
 * Se ancla al punto activo; su posición se calcula con su tamaño real antes
 * de pintarse (`useLayoutEffect`), así nunca se sale del lienzo.
 */
export function TooltipVidrio({ estado }: { estado: EstadoTooltip | null }) {
  const nodo = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const elemento = nodo.current
    if (!elemento || !estado) return
    const { left, top } = posicionTooltip(estado, {
      ancho: elemento.offsetWidth,
      alto: elemento.offsetHeight,
    })
    // La primera colocación no se anima (saldría deslizándose desde la
    // esquina); las siguientes siguen al puntero con una transición corta.
    const primera = elemento.dataset.colocado !== "si"
    if (primera) elemento.style.transitionProperty = "none"
    elemento.style.left = `${left}px`
    elemento.style.top = `${top}px`
    if (primera) {
      void elemento.offsetWidth
      elemento.style.transitionProperty = ""
      elemento.dataset.colocado = "si"
    }
  }, [estado])

  if (!estado) return null

  return (
    <div
      ref={nodo}
      aria-hidden
      data-slot="tooltip-grafico"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-20 flex max-w-64 min-w-36 flex-col gap-1.5 rounded-xl vidrio px-3 py-2.5 text-xs shadow-lg shadow-black/10",
        "animate-in transition-[left,top] duration-100 ease-out fade-in-0 zoom-in-95 motion-reduce:animate-none motion-reduce:transition-none"
      )}
    >
      <p className="font-medium text-muted-foreground">{estado.titulo}</p>
      <ul className="flex flex-col gap-1">
        {estado.filas.map((fila) => (
          <li key={fila.id} className="flex items-center gap-2">
            <MarcaSerie color={fila.color} clave={fila.clave} />
            <span className="font-semibold cifras whitespace-nowrap text-foreground">
              {fila.valor}
            </span>
            <span className="truncate text-muted-foreground">
              {fila.etiqueta}
            </span>
          </li>
        ))}
      </ul>
      {estado.pie ? (
        <p className="border-t pt-1.5 text-muted-foreground">{estado.pie}</p>
      ) : null}
    </div>
  )
}
