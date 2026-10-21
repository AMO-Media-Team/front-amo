"use client"

import { useQueryStates } from "nuqs"
import {
  createContext,
  type ReactNode,
  use,
  useMemo,
  useState,
  useTransition,
} from "react"

import type { PresetAutomatico } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import { parsersPeriodo, type ValoresPeriodo } from "../periodo"

interface ContextoPeriodo {
  /** El servidor está calculando el panel del periodo nuevo. */
  actualizando: boolean
  /** Veces que se cambió de periodo en esta visita (0 = aún ninguna). */
  cambios: number
  porDefecto: PresetAutomatico
  valores: ValoresPeriodo
  fijar: (valores: ValoresPeriodo) => void
}

/**
 * `id` del botón del selector de periodo: quien cambia el periodo desde un
 * control que desaparece al hacerlo le devuelve ahí el foco.
 */
export const ID_SELECTOR_PERIODO = "selector-periodo-panel"

const Contexto = createContext<ContextoPeriodo | null>(null)

export function usePeriodoPanel(): ContextoPeriodo {
  const contexto = use(Contexto)
  if (!contexto) {
    throw new Error("usePeriodoPanel debe usarse dentro de ProveedorPeriodo")
  }
  return contexto
}

/**
 * ¿El servidor está calculando el panel de otro periodo? Fuera del proveedor
 * (el aviso de un bloque que falló puede pintarse sin él), `false`.
 */
export function useActualizandoPanel(): boolean {
  return use(Contexto)?.actualizando ?? false
}

/**
 * Estado del periodo del panel: escribe la URL (nuqs) y vuelve a pedir el
 * panel al servidor dentro de una transición, así lo anterior sigue visible
 * (atenuado) mientras llega lo nuevo, sin saltos a esqueletos.
 */
export function ProveedorPeriodo({
  porDefecto,
  children,
}: {
  porDefecto: PresetAutomatico
  children: ReactNode
}) {
  const [actualizando, iniciar] = useTransition()
  const [cambios, setCambios] = useState(0)
  const [valores, fijarValores] = useQueryStates(parsersPeriodo, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  const valor = useMemo<ContextoPeriodo>(
    () => ({
      actualizando,
      cambios,
      porDefecto,
      valores,
      fijar: (siguientes) => {
        setCambios((veces) => veces + 1)
        void fijarValores(siguientes)
      },
    }),
    [actualizando, cambios, porDefecto, valores, fijarValores]
  )
  return <Contexto value={valor}>{children}</Contexto>
}

/**
 * Contenido del panel: se atenúa y anuncia la carga al cambiar de periodo.
 * Es además el contenedor de las consultas de tamaño (`@…/panel:`): las
 * rejillas del panel se acomodan al ancho real del contenido, que cambia con
 * la barra lateral abierta o plegada, y no al de la ventana.
 */
export function ContenidoPanel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const { actualizando, cambios } = usePeriodoPanel()
  return (
    <>
      {/*
       * `aria-busy` no se anuncia: quien no ve el panel atenuarse se entera
       * por esta región viva de que cambió el periodo y de que ya llegó.
       */}
      <p role="status" className="sr-only">
        {actualizando
          ? "Actualizando el panel…"
          : cambios > 0
            ? "Panel actualizado."
            : ""}
      </p>
      <div
        aria-busy={actualizando || undefined}
        className={cn(
          "@container/panel transition-opacity duration-300 ease-suave",
          actualizando &&
            "pointer-events-none opacity-55 motion-reduce:opacity-70",
          className
        )}
      >
        {children}
      </div>
    </>
  )
}
