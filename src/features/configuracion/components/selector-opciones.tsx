"use client"

import { Check, Plus, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface OpcionSelector {
  valor: string
  etiqueta: string
  /** Texto adicional para la búsqueda (código, alias…). */
  detalle?: string
}

/**
 * Elección múltiple sobre una lista larga (países): lo elegido como fichas
 * que se quitan con un clic y un buscador para agregar más.
 */
export function SelectorMultiple({
  opciones,
  valores,
  onCambio,
  etiquetaAgregar,
  deshabilitado,
  invalido,
  idDescripcion,
}: {
  opciones: readonly OpcionSelector[]
  valores: readonly string[]
  onCambio: (valores: string[]) => void
  etiquetaAgregar: string
  deshabilitado?: boolean
  invalido?: boolean
  idDescripcion?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const nombres = new Map(opciones.map((o) => [o.valor, o.etiqueta]))
  const elegidos = new Set(valores)

  function alternar(valor: string) {
    onCambio(
      elegidos.has(valor)
        ? valores.filter((actual) => actual !== valor)
        : [...valores, valor]
    )
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      aria-describedby={idDescripcion}
    >
      {valores.map((valor) => (
        <span
          key={valor}
          className="inline-flex h-7 items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-sm"
        >
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {valor}
          </span>
          {nombres.get(valor) ?? valor}
          <button
            type="button"
            onClick={() => alternar(valor)}
            disabled={deshabilitado}
            aria-label={`Quitar ${nombres.get(valor) ?? valor}`}
            className="grid size-5 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:anillo-foco disabled:opacity-50"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deshabilitado}
              aria-invalid={invalido || undefined}
              className="h-7 rounded-full border-dashed"
            />
          }
        >
          <Plus data-icon="inline-start" aria-hidden />
          {etiquetaAgregar}
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar…" />
            <CommandList>
              <CommandEmpty>Sin coincidencias.</CommandEmpty>
              <CommandGroup>
                {opciones.map((opcion) => {
                  const activo = elegidos.has(opcion.valor)
                  return (
                    <CommandItem
                      key={opcion.valor}
                      value={`${opcion.etiqueta} ${opcion.valor} ${opcion.detalle ?? ""}`}
                      data-checked={activo}
                      onSelect={() => alternar(opcion.valor)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-[4px] border",
                          activo
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input"
                        )}
                      >
                        {activo ? <Check className="size-3" /> : null}
                      </span>
                      <span className="truncate">{opcion.etiqueta}</span>
                      <span className="ml-auto font-mono text-[0.6875rem] text-muted-foreground">
                        {opcion.valor}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Elección múltiple sobre pocas opciones: fichas que se marcan y desmarcan. */
export function FichasOpciones({
  opciones,
  valores,
  onCambio,
  etiqueta,
  deshabilitado,
}: {
  opciones: readonly OpcionSelector[]
  valores: readonly string[]
  onCambio: (valores: string[]) => void
  /** Nombre accesible del grupo. */
  etiqueta: string
  deshabilitado?: boolean
}) {
  const elegidos = new Set(valores)
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
      {opciones.map((opcion) => {
        const activo = elegidos.has(opcion.valor)
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activo}
            disabled={deshabilitado}
            onClick={() =>
              onCambio(
                activo
                  ? valores.filter((v) => v !== opcion.valor)
                  : [...valores, opcion.valor]
              )
            }
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:anillo-foco disabled:opacity-50",
              activo
                ? "border-primary/45 bg-primary/12 text-foreground"
                : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-4 place-items-center rounded-full border transition-colors",
                activo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input"
              )}
            >
              {activo ? <Check className="size-3" /> : null}
            </span>
            {opcion.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
