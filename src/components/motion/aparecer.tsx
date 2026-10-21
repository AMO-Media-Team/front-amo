"use client"

import { type HTMLMotionProps, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"

export const EASE_SUAVE = [0.22, 1, 0.36, 1] as const

export interface AparecerProps extends HTMLMotionProps<"div"> {
  /** Segundos antes de empezar. */
  retraso?: number
  /** Posición en una secuencia; se suma `indice * intervalo` al retraso. */
  indice?: number
  intervalo?: number
  /** Desplazamiento vertical inicial en px. */
  desplazamiento?: number
  duracion?: number
}

/**
 * Fundido + ascenso corto al montar. Con movimiento reducido solo hay fundido.
 * Evítalo en el contenido que define el LCP: se pinta con opacidad 0 hasta hidratar.
 */
export function Aparecer({
  retraso = 0,
  indice = 0,
  intervalo = 0.06,
  desplazamiento = 10,
  duracion = 0.45,
  ...props
}: AparecerProps) {
  const reducido = useReducedMotion()

  return (
    <m.div
      initial={{ opacity: 0, y: reducido ? 0 : desplazamiento }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reducido ? 0.2 : duracion,
        delay: retraso + indice * intervalo,
        ease: EASE_SUAVE,
      }}
      {...props}
    />
  )
}
