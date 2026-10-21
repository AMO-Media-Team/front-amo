"use client"

import { useTheme } from "next-themes"
import { useCallback } from "react"
import { flushSync } from "react-dom"

import { ignorarAbortoDeTransicion } from "@/components/motion/abortos-transicion"

export type Tema = "light" | "dark" | "system"

interface Origen {
  x: number
  y: number
}

const ATRIBUTO = "data-transicion"

function prefiereMovimientoReducido(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Radio que cubre todo el viewport desde el origen del clic. */
function radioHastaEsquinaMasLejana({ x, y }: Origen): number {
  return Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  )
}

function origenDelEvento(evento?: {
  clientX: number
  clientY: number
}): Origen {
  // Los clics de teclado llegan con coordenadas 0,0: se usa el centro.
  if (!evento || (evento.clientX === 0 && evento.clientY === 0)) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }
  return { x: evento.clientX, y: evento.clientY }
}

/**
 * Cambia el tema con un revelado circular (View Transition API) que nace en el
 * punto del clic. Sin soporte del navegador o con movimiento reducido, cambia
 * al instante; si el navegador descarta la transición, el tema cambia igual,
 * sin animación. El CSS vive en globals.css (`:root[data-transicion="tema"]`).
 */
export function useTransicionTema() {
  const { setTheme, theme, resolvedTheme } = useTheme()

  const cambiarTema = useCallback(
    (tema: Tema, evento?: { clientX: number; clientY: number }) => {
      const aplicar = () => setTheme(tema)
      if (!document.startViewTransition || prefiereMovimientoReducido()) {
        aplicar()
        return
      }

      const raiz = document.documentElement
      const origen = origenDelEvento(evento)
      raiz.style.setProperty("--vt-x", `${origen.x}px`)
      raiz.style.setProperty("--vt-y", `${origen.y}px`)
      raiz.style.setProperty(
        "--vt-radio",
        `${radioHastaEsquinaMasLejana(origen)}px`
      )
      raiz.setAttribute(ATRIBUTO, "tema")

      // flushSync: el DOM debe reflejar el nuevo tema dentro del callback.
      const transicion = document.startViewTransition(() => flushSync(aplicar))
      const limpiar = () => raiz.removeAttribute(ATRIBUTO)
      // El navegador puede descartar el revelado (la ventana cambió de tamaño,
      // otra transición lo interrumpió) y rechaza estas promesas: el tema ya
      // quedó aplicado, así que ese aborto no es un error que reportar.
      transicion.ready.catch(ignorarAbortoDeTransicion)
      transicion.finished.then(limpiar, (error: unknown) => {
        limpiar()
        ignorarAbortoDeTransicion(error)
      })
    },
    [setTheme]
  )

  return {
    tema: theme as Tema | undefined,
    temaResuelto: resolvedTheme as "light" | "dark" | undefined,
    cambiarTema,
  }
}
