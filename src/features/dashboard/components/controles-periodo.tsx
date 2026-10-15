"use client"

import { periodoAnterior } from "@/lib/fechas"
import { cn } from "@/lib/utils"

import { rangoPanel, textoPeriodoComparado } from "../periodo"
import { usePeriodoPanel } from "./proveedor-periodo"
import { SelectorPeriodoPanel } from "./selector-periodo-panel"

/** Selector de periodo y, debajo, contra qué fechas se comparan las cifras. */
export function ControlesPeriodo({ className }: { className?: string }) {
  const { valores, porDefecto } = usePeriodoPanel()
  const anterior = periodoAnterior(rangoPanel(valores, porDefecto))
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5 sm:w-auto sm:items-end",
        className
      )}
    >
      <SelectorPeriodoPanel className="w-full sm:w-auto sm:min-w-48" />
      <p
        className="text-xs text-muted-foreground sm:text-right"
        suppressHydrationWarning
      >
        Comparado con{" "}
        <span className="cifras text-foreground/80">
          {textoPeriodoComparado(anterior)}
        </span>
      </p>
    </div>
  )
}
