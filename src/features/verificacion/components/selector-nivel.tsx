"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { BadgeCheck } from "lucide-react"
import { useId } from "react"

import { formatearCOPCompacto } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { NivelExpediente } from "../tipos"

/**
 * Nivel que se evalúa: control segmentado con los niveles configurados
 * (marca el actual del medio) y, debajo, su nombre y tope anual.
 */
export function SelectorNivel({
  niveles,
  valor,
  nivelActual,
  onCambiar,
  deshabilitado = false,
}: {
  niveles: readonly NivelExpediente[]
  valor: number
  nivelActual: number
  onCambiar: (nivel: number) => void
  deshabilitado?: boolean
}) {
  const idTitulo = useId()
  const idAyuda = useId()
  const elegido = niveles.find((nivel) => nivel.nivel === valor)
  return (
    <div className="flex flex-col gap-2">
      <p id={idTitulo} className="text-xs font-medium text-muted-foreground">
        Nivel a evaluar
      </p>
      <RadioGroupPrimitive
        value={String(valor)}
        onValueChange={(nuevo) => {
          const nivel = Number(nuevo)
          if (niveles.some((opcion) => opcion.nivel === nivel)) onCambiar(nivel)
        }}
        disabled={deshabilitado}
        aria-labelledby={idTitulo}
        aria-describedby={idAyuda}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1"
      >
        {niveles.map((nivel) => (
          <RadioPrimitive.Root
            key={nivel.nivel}
            value={String(nivel.nivel)}
            className={cn(
              "relative flex h-10 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors outline-none select-none",
              "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              "data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm",
              "data-disabled:cursor-not-allowed data-disabled:opacity-60"
            )}
          >
            Nivel {nivel.nivel}
            {nivel.nivel === nivelActual ? (
              <>
                <BadgeCheck aria-hidden className="size-3.5 text-success" />
                <span className="sr-only"> (su nivel actual)</span>
              </>
            ) : null}
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
      <p id={idAyuda} className="text-sm text-pretty">
        {elegido ? (
          <>
            <span className="font-medium">{elegido.nombre}</span>
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              {elegido.tope === null
                ? "sin tope anual"
                : `tope anual de ${formatearCOPCompacto(elegido.tope)}`}
            </span>
          </>
        ) : null}
      </p>
    </div>
  )
}
