"use client"

import { ChevronDown, type LucideIcon } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface OpcionUnica {
  valor: string
  etiqueta: string
}

/** A partir de este número de opciones aparece el buscador. */
const OPCIONES_CON_BUSCADOR = 8

interface FiltroOpcionProps {
  /** Nombre del filtro ("Departamento"). */
  titulo: string
  icono: LucideIcon
  /** Texto de la opción "sin filtro" ("Todo el país"). */
  textoTodos: string
  opciones: readonly OpcionUnica[]
  valor: string | null
  onCambiar: (valor: string | null) => void
  className?: string
}

/**
 * Filtro de una sola opción en un popover con buscador (departamento,
 * anunciante, sector). El botón muestra el nombre del filtro y lo elegido.
 */
export function FiltroOpcion({
  titulo,
  icono: Icono,
  textoTodos,
  opciones,
  valor,
  onCambiar,
  className,
}: FiltroOpcionProps) {
  const idTitulo = useId()
  const [abierto, setAbierto] = useState(false)
  const elegida = opciones.find((opcion) => opcion.valor === valor)
  // Un valor de la URL que no está en la lista (enlace viejo, opción retirada)
  // sigue filtrando: se dice, en lugar de aparentar que no hay filtro.
  const filtrando = valor !== null
  const etiqueta =
    elegida?.etiqueta ?? (filtrando ? "Selección no disponible" : textoTodos)

  function elegir(siguiente: string | null) {
    onCambiar(siguiente)
    setAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "max-w-full min-w-0 justify-start bg-card dark:bg-input/30",
              filtrando && "border-primary/40",
              className
            )}
          />
        }
        aria-label={`${titulo}: ${etiqueta}`}
      >
        <Icono data-icon="inline-start" aria-hidden />
        <span className="text-muted-foreground max-sm:sr-only">{titulo}</span>
        <span
          aria-hidden
          className="h-3.5 w-px shrink-0 bg-border max-sm:hidden"
        />
        <span className={cn("truncate", filtrando && "font-medium")}>
          {etiqueta}
        </span>
        <ChevronDown
          data-icon="inline-end"
          aria-hidden
          className="opacity-60"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-0"
      >
        <Command aria-labelledby={idTitulo}>
          <span id={idTitulo} className="sr-only">
            Filtrar por {titulo.toLocaleLowerCase("es-CO")}
          </span>
          {opciones.length >= OPCIONES_CON_BUSCADOR ? (
            <CommandInput
              placeholder={`Buscar ${titulo.toLocaleLowerCase("es-CO")}…`}
            />
          ) : null}
          <CommandList>
            <CommandEmpty>Sin coincidencias.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`__todos__ ${textoTodos}`}
                data-checked={valor === null}
                onSelect={() => elegir(null)}
              >
                <span className="flex-1 truncate">{textoTodos}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              {opciones.map((opcion) => {
                const activa = opcion.valor === valor
                return (
                  <CommandItem
                    key={opcion.valor}
                    value={`${opcion.etiqueta} ${opcion.valor}`}
                    data-checked={activa}
                    onSelect={() => elegir(opcion.valor)}
                  >
                    <span className="flex-1 truncate">{opcion.etiqueta}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
