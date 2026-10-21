"use client"

import { type Variants, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import type { ReactNode } from "react"

import { EASE_SUAVE } from "./aparecer"

interface ListaEscalonadaProps {
  children: ReactNode
  className?: string
  como?: "div" | "ul" | "ol"
  /** Segundos entre un elemento y el siguiente. */
  intervalo?: number
  retraso?: number
}

interface ElementoEscalonadoProps {
  children: ReactNode
  className?: string
  como?: "div" | "li" | "article"
}

const variantesElemento: Variants = {
  oculto: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_SUAVE },
  },
}

const variantesElementoReducido: Variants = {
  oculto: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
}

/**
 * Contenedor que revela a sus `ElementoEscalonado` en cascada al montar.
 * Pensado para rejillas de tarjetas y listas cortas (no para tablas largas).
 */
export function ListaEscalonada({
  children,
  className,
  como = "div",
  intervalo = 0.05,
  retraso = 0,
}: ListaEscalonadaProps) {
  const Contenedor = m[como]
  const variantes: Variants = {
    oculto: {},
    visible: {
      transition: { staggerChildren: intervalo, delayChildren: retraso },
    },
  }

  return (
    <Contenedor
      className={className}
      variants={variantes}
      initial="oculto"
      animate="visible"
    >
      {children}
    </Contenedor>
  )
}

export function ElementoEscalonado({
  children,
  className,
  como = "div",
}: ElementoEscalonadoProps) {
  const reducido = useReducedMotion()
  const Elemento = m[como]

  return (
    <Elemento
      className={className}
      variants={reducido ? variantesElementoReducido : variantesElemento}
    >
      {children}
    </Elemento>
  )
}
