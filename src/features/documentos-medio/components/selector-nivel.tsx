"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { BadgeCheck } from "lucide-react"
import { useId } from "react"

import { cn } from "@/lib/utils"

import { esNivel, NIVELES } from "../requisitos"
import type { NivelVerificacion, RequisitosNivel } from "../tipos"

export interface SelectorNivelProps {
  valor: NivelVerificacion
  onCambiar: (nivel: NivelVerificacion) => void
  niveles: readonly RequisitosNivel[]
  /** Nivel verificado del medio (0 si aún no lo está). */
  nivelActual: number
  explicacion: string
  /** Mientras sube un documento no se cambia la lista que lo contiene. */
  deshabilitado?: boolean
}

/**
 * «¿A qué nivel aspiras?»: control segmentado (radio) con los tres niveles;
 * debajo, el nombre del elegido, sus requisitos y por qué se sugiere.
 */
export function SelectorNivel({
  valor,
  onCambiar,
  niveles,
  nivelActual,
  explicacion,
  deshabilitado = false,
}: SelectorNivelProps) {
  const idTitulo = useId()
  const idAyuda = useId()
  const elegido = niveles.find((nivel) => nivel.nivel === valor)
  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <h2 id={idTitulo} className="text-sm font-semibold">
        Nivel al que aspiras
      </h2>
      <RadioGroupPrimitive
        value={valor}
        onValueChange={(nuevo) => {
          if (esNivel(nuevo)) onCambiar(nuevo)
        }}
        disabled={deshabilitado}
        aria-labelledby={idTitulo}
        aria-describedby={idAyuda}
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {NIVELES.map((nivel) => (
          <RadioPrimitive.Root
            key={nivel}
            value={nivel}
            className={cn(
              "relative flex h-10 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors outline-none select-none",
              "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              "data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm",
              "data-disabled:cursor-not-allowed data-disabled:opacity-60"
            )}
          >
            Nivel {nivel}
            {nivel === nivelActual ? (
              <>
                <BadgeCheck aria-hidden className="size-3.5 text-success" />
                <span className="sr-only"> (tu nivel actual)</span>
              </>
            ) : null}
          </RadioPrimitive.Root>
        ))}
      </RadioGroupPrimitive>
      <div id={idAyuda} className="flex flex-col gap-1">
        {elegido ? (
          <p className="text-sm font-medium">{elegido.nombre}</p>
        ) : null}
        <p className="text-xs text-pretty text-muted-foreground">
          {explicacion}
        </p>
        {deshabilitado ? (
          <p className="text-xs text-pretty text-muted-foreground">
            Espera a que termine la subida para cambiar de nivel.
          </p>
        ) : null}
      </div>
    </section>
  )
}
