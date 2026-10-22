"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { ArrowRight, BadgeCheck, Lightbulb } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { esNivel, NIVELES } from "../requisitos"
import type { NivelVerificacion, RequisitosNivel } from "../tipos"
import { Nota } from "./avisos"

export interface SugerenciaNivel {
  nivel: NivelVerificacion
  /** Por qué se sugiere (lo que declaró en sus datos de pago). */
  texto: string
}

export interface SelectorNivelProps {
  valor: NivelVerificacion
  onCambiar: (nivel: NivelVerificacion) => void
  niveles: readonly RequisitosNivel[]
  /** Nivel verificado del medio; `null` mientras está en alta. */
  nivelActual: NivelVerificacion | null
  explicacion: string
  /** Un nivel mayor que corresponde a lo que declaró; `null` si no aplica. */
  sugerencia?: SugerenciaNivel | null
  /** Mientras sube un documento no se cambia la lista que lo contiene. */
  deshabilitado?: boolean
}

/**
 * Nivel cuyos documentos se consultan: control segmentado (radio) con los
 * tres niveles; debajo, el nombre del elegido, por qué se ve y, si lo que
 * declaró el medio corresponde a un nivel mayor, la sugerencia de verlo.
 */
export function SelectorNivel({
  valor,
  onCambiar,
  niveles,
  nivelActual,
  explicacion,
  sugerencia = null,
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
        Nivel de verificación
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
            // Nombre explícito: el texto oculto tras el icono sumaba un espacio
            // antes de la coma («Nivel 1 , tu nivel actual»).
            aria-label={
              nivel === nivelActual
                ? `Nivel ${nivel}, tu nivel actual`
                : `Nivel ${nivel}`
            }
            className={cn(
              "relative flex h-11 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors outline-none select-none",
              "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              "data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm",
              "data-disabled:cursor-not-allowed data-disabled:opacity-60"
            )}
          >
            Nivel {nivel}
            {nivel === nivelActual ? (
              <BadgeCheck aria-hidden className="size-3.5 text-success" />
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
      {sugerencia ? (
        <Nota tono="info" icono={Lightbulb}>
          <p>{sugerencia.texto}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={deshabilitado}
            onClick={() => onCambiar(sugerencia.nivel)}
          >
            Ver el nivel {sugerencia.nivel}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Button>
        </Nota>
      ) : null}
    </section>
  )
}
