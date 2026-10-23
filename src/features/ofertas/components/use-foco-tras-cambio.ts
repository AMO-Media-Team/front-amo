"use client"

import { useRef } from "react"

import type { ResultadoAccion } from "@/lib/result"

import { avisoEstadoOferta } from "../foco"

export interface FocoTrasCambio {
  /** Al abrir un diálogo: todavía no cambió nada. */
  reiniciar: () => void
  /** Anota el resultado de la acción y lo devuelve tal cual. */
  anotar: <R extends ResultadoAccion<unknown>>(respuesta: R) => R
  /** `focoAlCerrar` del diálogo (`finalFocus` de Base UI). */
  focoAlCerrar: () => HTMLElement | null
}

/**
 * Foco tras cambiar el estado de la oferta desde un diálogo (WCAG 2.4.3).
 * El botón que lo abrió suele desaparecer con el repintado (la oferta ya no
 * admite esa acción) y el foco caería en `<body>`, al inicio de la página.
 * Tras confirmar va al aviso del estado, que siempre está en la ficha y
 * anuncia el nuevo; si el diálogo se cierra sin cambio (cancelar, Escape o un
 * fallo), vuelve al botón (`null`: comportamiento por defecto del diálogo).
 */
export function useFocoTrasCambio(): FocoTrasCambio {
  const cambio = useRef(false)
  return {
    reiniciar: () => {
      cambio.current = false
    },
    anotar: (respuesta) => {
      if (respuesta.ok) cambio.current = true
      return respuesta
    },
    focoAlCerrar: () => (cambio.current ? avisoEstadoOferta() : null),
  }
}
