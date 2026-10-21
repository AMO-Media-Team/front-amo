"use client"

import { useCallback, useState } from "react"

import { cn } from "@/lib/utils"

import type { ElementoLeyenda } from "./tipos"

export type { ElementoLeyenda }

interface LeyendaGraficoProps {
  elementos: readonly ElementoLeyenda[]
  ocultos?: ReadonlySet<string>
  /** Sin callback la leyenda es estática (no alterna series). */
  onAlternar?: (id: string) => void
  /** Resalta el elemento bajo el puntero o el foco (dona). */
  onResaltar?: (id: string | null) => void
  orientacion?: "horizontal" | "vertical"
  className?: string
}

/** Series ocultas por id: el color sigue a la entidad aunque otras se oculten. */
export function useSeriesOcultas() {
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set())
  const alternar = useCallback((id: string) => {
    setOcultas((previas) => {
      const siguientes = new Set(previas)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }, [])
  return { ocultas, alternar }
}

function Muestra({ color, marca }: Pick<ElementoLeyenda, "color" | "marca">) {
  if (marca === "bloque") {
    return (
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="w-3.5 shrink-0 border-t-2"
      style={{
        borderColor: color,
        borderTopStyle: marca === "discontinua" ? "dashed" : "solid",
      }}
    />
  )
}

/**
 * Leyenda HTML: identidad nunca solo por color (nombre junto a la muestra) y,
 * si se permite, alterna la visibilidad de cada serie con un botón accesible.
 */
export function LeyendaGrafico({
  elementos,
  ocultos,
  onAlternar,
  onResaltar,
  orientacion = "horizontal",
  className,
}: LeyendaGraficoProps) {
  const interactiva = Boolean(onAlternar)

  return (
    <ul
      aria-label={
        interactiva
          ? "Leyenda: activa una serie para mostrarla u ocultarla"
          : "Leyenda"
      }
      className={cn(
        "flex text-xs",
        orientacion === "horizontal"
          ? "flex-wrap items-center gap-x-1 gap-y-1"
          : "flex-col gap-0.5",
        className
      )}
    >
      {elementos.map((elemento) => {
        const oculto = ocultos?.has(elemento.id) ?? false
        const contenido = (
          <>
            <Muestra color={elemento.color} marca={elemento.marca} />
            <span
              className={cn(
                "line-clamp-2 min-w-0 text-left break-words",
                oculto && "line-through"
              )}
            >
              {elemento.nombre}
            </span>
            {elemento.valor ? (
              <span className="ml-auto pl-3 font-medium cifras text-foreground">
                {elemento.valor}
              </span>
            ) : null}
          </>
        )
        const clases = cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-muted-foreground",
          oculto && "opacity-45"
        )
        return (
          <li
            key={elemento.id}
            className={cn(orientacion === "vertical" && "w-full")}
            onPointerEnter={() => onResaltar?.(elemento.id)}
            onPointerLeave={() => onResaltar?.(null)}
          >
            {interactiva ? (
              <button
                type="button"
                aria-pressed={!oculto}
                onClick={() => onAlternar?.(elemento.id)}
                onFocus={() => onResaltar?.(elemento.id)}
                onBlur={() => onResaltar?.(null)}
                className={cn(
                  clases,
                  "transition-colors hover:bg-muted hover:text-foreground focus-visible:anillo-foco"
                )}
              >
                {contenido}
              </button>
            ) : (
              <span className={clases}>{contenido}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
