"use client"

import { Building2, ChevronsUpDown } from "lucide-react"
import { type Ref, useCallback, useMemo, useState } from "react"

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
import { InsigniaEstado } from "@/features/operacion/components/distintivos"
import { ESTADOS_ANUNCIANTE } from "@/features/operacion/estados"

import { filtrarAnunciantes, type OpcionAnuncianteGestion } from "../gestion"

function NombreAnunciante({ opcion }: { opcion: OpcionAnuncianteGestion }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <span className="truncate">{opcion.nombre}</span>
      <InsigniaEstado
        catalogo={ESTADOS_ANUNCIANTE}
        estado={opcion.estado}
        className="h-5 shrink-0 px-2 text-[0.6875rem]"
      />
    </span>
  )
}

/**
 * Empresa por cuenta de la cual el equipo AMO crea la campaña (ADM-014), con
 * búsqueda por nombre (sin tildes) y su estado de verificación a la vista: con
 * cualquiera se preparan borradores, pero activar exige la empresa
 * verificada. `ref` llega al disparador: el formulario lleva ahí el foco
 * cuando falta la empresa.
 */
export function SelectorAnunciante({
  ref,
  id,
  valor,
  opciones,
  onCambio,
  invalido,
  descripcion,
  deshabilitado,
}: {
  ref?: Ref<HTMLButtonElement>
  id?: string
  /** Id del anunciante elegido ('' si ninguno). */
  valor: string
  opciones: readonly OpcionAnuncianteGestion[]
  onCambio: (anuncianteId: string) => void
  invalido?: boolean
  /** Ids de la ayuda y el error del campo (`aria-describedby`). */
  descripcion?: string
  deshabilitado?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  // cmdk fija el id de su listbox (pisa el que se le pase): se lee del nodo
  // montado para que `aria-controls` apunte a un elemento que existe.
  const [idLista, setIdLista] = useState<string | undefined>()
  const refLista = useCallback((nodo: HTMLDivElement | null) => {
    if (!nodo) return
    setIdLista(nodo.id || undefined)
    return () => setIdLista(undefined)
  }, [])
  const elegido = opciones.find((opcion) => opcion.id === valor)
  const resultados = useMemo(
    () => filtrarAnunciantes(opciones, texto),
    [opciones, texto]
  )

  // Cada apertura empieza sin texto: lo buscado antes no filtra la lista.
  function cambiarAbierto(siguiente: boolean) {
    setAbierto(siguiente)
    if (!siguiente) setTexto("")
  }

  function elegir(anuncianteId: string) {
    onCambio(anuncianteId)
    cambiarAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={cambiarAbierto}>
      <PopoverTrigger
        ref={ref}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={abierto && idLista ? idLista : undefined}
            aria-invalid={invalido || undefined}
            aria-describedby={descripcion}
            disabled={deshabilitado}
            className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
          />
        }
      >
        {elegido ? (
          <NombreAnunciante opcion={elegido} />
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Building2 aria-hidden className="size-4" />
            Elige el anunciante
          </span>
        )}
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder="Nombre comercial"
            aria-label="Buscar anunciante por nombre"
          />
          <CommandList ref={refLista}>
            <CommandEmpty>Ningún anunciante coincide.</CommandEmpty>
            {resultados.length > 0 ? (
              <CommandGroup
                heading={texto.trim() === "" ? "Anunciantes" : undefined}
              >
                {resultados.map((opcion) => (
                  <CommandItem
                    key={opcion.id}
                    value={opcion.id}
                    data-checked={opcion.id === valor}
                    onSelect={() => elegir(opcion.id)}
                  >
                    <NombreAnunciante opcion={opcion} />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
