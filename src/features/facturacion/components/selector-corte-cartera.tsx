"use client"

import { useQueryStates } from "nuqs"
import { useTransition } from "react"

import { SelectorCorte } from "@/features/reportes/components/selector-corte"
import { cn } from "@/lib/utils"

import { parsersCartera } from "../listado"

/**
 * Fecha de corte de la cartera en la URL (`?corte=`; sin ella, hoy). Reusa el
 * selector del reporte de cartera: cierres habituales o cualquier día pasado.
 */
export function SelectorCorteCartera() {
  const [cargando, iniciar] = useTransition()
  const [valores, fijar] = useQueryStates(parsersCartera, {
    shallow: false,
    scroll: false,
    startTransition: iniciar,
  })
  return (
    <div
      aria-busy={cargando || undefined}
      className={cn("transition-opacity", cargando && "opacity-70")}
    >
      <SelectorCorte
        valor={valores.corte}
        onCambiar={(corte) => void fijar({ corte })}
      />
    </div>
  )
}
