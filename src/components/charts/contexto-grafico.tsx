"use client"

import { createContext, type RefObject, use, useEffect } from "react"

import type {
  DatosAccesibles,
  ElementoLeyenda,
  InstanciaGrafico,
} from "./tipos"

export interface GraficoRegistrado extends DatosAccesibles {
  instancia: RefObject<InstanciaGrafico | null>
  /** La leyenda es HTML: se publica para dibujarla en la imagen exportada. */
  leyenda?: readonly ElementoLeyenda[]
  /** La imagen exportada repite la disposición de la pantalla. */
  leyendaAlLado?: boolean
}

type Registrar = (grafico: GraficoRegistrado | null) => void

/**
 * Canal entre un gráfico y su `TarjetaGrafico` (o una captura para
 * documentos): el gráfico publica su instancia y su leyenda (para exportar la
 * imagen), su resumen y su tabla (para "Ver datos").
 */
export const ContextoRegistroGrafico = createContext<Registrar | null>(null)

export function useRegistrarGrafico(
  instancia: RefObject<InstanciaGrafico | null>,
  datos: DatosAccesibles,
  leyenda?: readonly ElementoLeyenda[],
  leyendaAlLado = false
): void {
  const registrar = use(ContextoRegistroGrafico)
  const { resumen, tabla } = datos

  useEffect(() => {
    if (!registrar) return
    registrar({ instancia, resumen, tabla, leyenda, leyendaAlLado })
    return () => registrar(null)
  }, [registrar, instancia, resumen, tabla, leyenda, leyendaAlLado])
}
