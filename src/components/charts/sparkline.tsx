"use client"

import { useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { useId, useMemo } from "react"

import { cn } from "@/lib/utils"

import { trazarSparkline } from "./trazado-sparkline"

export type TonoSparkline = "primario" | "exito" | "peligro" | "neutro"

const TONOS: Readonly<Record<TonoSparkline, string>> = {
  primario: "text-primary",
  exito: "text-success",
  peligro: "text-destructive",
  neutro: "text-muted-foreground",
}

interface SparklineProps {
  valores: readonly (number | null)[]
  tono?: TonoSparkline
  /** Tamaño intrínseco del SVG (sin deformar el punto final). */
  ancho?: number
  alto?: number
  className?: string
}

/**
 * Sparkline mínima en SVG: se pinta en el servidor (sin lienzo ni salto de
 * diseño), hereda el color del tono vía `currentColor` y dibuja su trazo al
 * aparecer, salvo con movimiento reducido. Es decorativa: la tarjeta que la
 * contiene dice la cifra y su variación en texto.
 */
export function Sparkline({
  valores,
  tono = "primario",
  ancho = 96,
  alto = 32,
  className,
}: SparklineProps) {
  const id = useId()
  const reducido = useReducedMotion()
  const trazado = useMemo(
    () => trazarSparkline(valores, ancho, alto),
    [valores, ancho, alto]
  )
  if (!trazado.linea) return null

  const animar = !reducido
  const degradado = `sparkline-${id.replace(/:/g, "")}`

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${ancho} ${alto}`}
      width={ancho}
      height={alto}
      className={cn("shrink-0 overflow-visible", TONOS[tono], className)}
    >
      <defs>
        <linearGradient id={degradado} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <m.path
        d={trazado.area}
        fill={`url(#${degradado})`}
        initial={animar ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.35 }}
      />
      <m.path
        d={trazado.linea}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animar ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      {trazado.ultimo ? (
        <m.circle
          cx={trazado.ultimo.x}
          cy={trazado.ultimo.y}
          r={2.75}
          fill="currentColor"
          className="stroke-card"
          strokeWidth={1.5}
          initial={animar ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 0.8 }}
        />
      ) : null}
    </svg>
  )
}
