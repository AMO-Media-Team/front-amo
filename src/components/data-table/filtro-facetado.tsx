"use client"

import { CirclePlus, type LucideIcon } from "lucide-react"
import { useId } from "react"

import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export interface OpcionFiltro {
  valor: string
  etiqueta: string
  /** Punto de color (HEX), p. ej. el color de un rol. */
  color?: string
  icono?: LucideIcon
}

export interface FiltroFacetado<K extends string = string> {
  /** Clave del filtro en `definirEstadoTabla({ filtros })` (y en la URL). */
  clave: K
  titulo: string
  opciones: readonly OpcionFiltro[]
}

/** A partir de este número de opciones el filtro ofrece un buscador. */
const OPCIONES_CON_BUSCADOR = 7
/** Distintivos visibles en el botón antes de resumir ("3 seleccionados"). */
const DISTINTIVOS_VISIBLES = 2

interface FiltroFacetadoProps {
  filtro: FiltroFacetado
  seleccionados: readonly string[]
  onCambiar: (valores: readonly string[]) => void
}

function MarcaOpcion({ opcion }: { opcion: OpcionFiltro }) {
  if (opcion.icono) {
    const Icono = opcion.icono
    return <Icono className="text-muted-foreground" aria-hidden />
  }
  if (opcion.color) {
    return (
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: opcion.color }}
      />
    )
  }
  return null
}

function ResumenSeleccion({
  filtro,
  seleccionados,
}: {
  filtro: FiltroFacetado
  seleccionados: readonly string[]
}) {
  if (seleccionados.length === 0) return null
  const etiquetas = filtro.opciones
    .filter((opcion) => seleccionados.includes(opcion.valor))
    .map((opcion) => opcion.etiqueta)

  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 h-4" />
      {etiquetas.length > DISTINTIVOS_VISIBLES ? (
        <Badge variant="secondary" className="rounded-sm px-1.5 font-normal">
          {etiquetas.length} seleccionados
        </Badge>
      ) : (
        etiquetas.map((etiqueta) => (
          <Badge
            key={etiqueta}
            variant="secondary"
            className="rounded-sm px-1.5 font-normal"
          >
            {etiqueta}
          </Badge>
        ))
      )}
    </>
  )
}

/**
 * Filtro de selección múltiple en un popover (patrón "faceted filter"). El
 * botón resume lo elegido; con muchas opciones aparece un buscador.
 */
export function FiltroFacetadoTabla({
  filtro,
  seleccionados,
  onCambiar,
}: FiltroFacetadoProps) {
  const idTitulo = useId()

  function alternar(valor: string) {
    onCambiar(
      seleccionados.includes(valor)
        ? seleccionados.filter((actual) => actual !== valor)
        : [...seleccionados, valor]
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "border-dashed",
              seleccionados.length > 0 && "border-solid border-primary/40"
            )}
          />
        }
      >
        <CirclePlus data-icon="inline-start" aria-hidden />
        {filtro.titulo}
        <ResumenSeleccion filtro={filtro} seleccionados={seleccionados} />
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command aria-labelledby={idTitulo}>
          <span id={idTitulo} className="sr-only">
            Filtrar por {filtro.titulo.toLocaleLowerCase("es-CO")}
          </span>
          {filtro.opciones.length >= OPCIONES_CON_BUSCADOR ? (
            <CommandInput
              placeholder={`Buscar ${filtro.titulo.toLocaleLowerCase("es-CO")}…`}
            />
          ) : null}
          <CommandList>
            <CommandEmpty>Sin coincidencias.</CommandEmpty>
            <CommandGroup>
              {filtro.opciones.map((opcion) => {
                const activo = seleccionados.includes(opcion.valor)
                return (
                  <CommandItem
                    key={opcion.valor}
                    value={`${opcion.etiqueta} ${opcion.valor}`}
                    data-checked={activo}
                    aria-selected={activo}
                    onSelect={() => alternar(opcion.valor)}
                  >
                    <MarcaOpcion opcion={opcion} />
                    <span className="truncate">{opcion.etiqueta}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {seleccionados.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__limpiar__"
                    onSelect={() => onCambiar([])}
                    className="justify-center text-center"
                  >
                    Quitar filtro
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
