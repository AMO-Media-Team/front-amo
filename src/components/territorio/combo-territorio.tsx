"use client"

import { ChevronsUpDown, type LucideIcon } from "lucide-react"
import { type ReactNode, useCallback, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
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

import { filtrarTerritorio } from "./busqueda"
import { EstadoLista, type EstadoConsulta } from "./partes"

export interface PropsComboTerritorio<T extends { codigo: string }> {
  id: string
  /** Código elegido (`null` si ninguno). */
  valor: string | null
  /** Texto del valor en el disparador (o un esqueleto mientras se resuelve). */
  etiquetaValor: ReactNode
  placeholder: string
  placeholderBusqueda: string
  textoVacio: string
  icono: LucideIcon
  consulta: EstadoConsulta & { data?: readonly T[] }
  /** Textos por los que se busca cada opción (además del código). */
  nombres: (opcion: T) => readonly string[]
  contenido: (opcion: T) => ReactNode
  onElegir: (opcion: T) => void
  abierto?: boolean
  onAbiertoChange?: (abierto: boolean) => void
  /**
   * `ninguno`: al elegir, el foco no vuelve al disparador (quien lo usa abre
   * otro panel enseguida y el retorno tardío del foco se lo robaría).
   */
  focoTrasElegir?: "disparador" | "ninguno"
  deshabilitado?: boolean
  invalido?: boolean
  describedBy?: string
}

/**
 * Lista desplegable con buscador para elegir UN departamento o municipio.
 * Busca sin tildes (y por código) en la lista ya cargada; muestra carga,
 * error con reintento y «sin coincidencias» dentro del mismo panel (junto a
 * la lista, no dentro: el listbox solo contiene opciones).
 */
export function ComboTerritorio<T extends { codigo: string }>({
  id,
  valor,
  etiquetaValor,
  placeholder,
  placeholderBusqueda,
  textoVacio,
  icono: Icono,
  consulta,
  nombres,
  contenido,
  onElegir,
  abierto: abiertoControlado,
  onAbiertoChange,
  focoTrasElegir = "disparador",
  deshabilitado,
  invalido,
  describedBy,
}: PropsComboTerritorio<T>) {
  const [abiertoInterno, setAbiertoInterno] = useState(false)
  const [texto, setTexto] = useState("")
  // cmdk fija el id de su listbox (pisa el que se le pase a CommandList): se
  // lee del nodo para que `aria-controls` apunte a la lista que existe.
  const [idLista, setIdLista] = useState<string>()
  const registrarLista = useCallback(
    (nodo: HTMLDivElement | null) => setIdLista(nodo?.id || undefined),
    []
  )
  const eligio = useRef(false)
  const abierto = abiertoControlado ?? abiertoInterno
  const filtradas = consulta.data
    ? filtrarTerritorio(consulta.data, texto, nombres)
    : []

  // Cada apertura empieza sin texto: lo buscado antes no filtra la lista nueva.
  function cambiarAbierto(siguiente: boolean) {
    setAbiertoInterno(siguiente)
    onAbiertoChange?.(siguiente)
    if (!siguiente) setTexto("")
  }

  return (
    <Popover open={abierto} onOpenChange={cambiarAbierto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            aria-controls={abierto ? idLista : undefined}
            aria-invalid={invalido || undefined}
            aria-describedby={describedBy}
            disabled={deshabilitado}
            className="h-9 w-full justify-between font-normal"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icono
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className={cn("truncate", !valor && "text-muted-foreground")}>
            {valor ? etiquetaValor : placeholder}
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        className="w-(--anchor-width) max-w-[calc(100vw-2rem)] min-w-72 p-0"
        align="start"
        finalFocus={() => {
          const devolver = !(eligio.current && focoTrasElegir === "ninguno")
          eligio.current = false
          return devolver
        }}
      >
        {/* `label` nombra el buscador: cmdk le pone `aria-labelledby` a su
            propia etiqueta oculta, que anula cualquier `aria-label`. */}
        <Command shouldFilter={false} label={placeholderBusqueda}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder={placeholderBusqueda}
          />
          {/* Fuera del listbox: dentro solo caben opciones. */}
          <EstadoLista
            consulta={consulta}
            hayDatos={consulta.data !== undefined}
            hayFilas={filtradas.length > 0}
            textoVacio={texto ? `Nada coincide con «${texto}».` : textoVacio}
          />
          <CommandList ref={registrarLista}>
            {filtradas.length > 0 ? (
              <CommandGroup>
                {filtradas.map((opcion) => (
                  <CommandItem
                    key={opcion.codigo}
                    value={opcion.codigo}
                    data-checked={opcion.codigo === valor}
                    aria-checked={opcion.codigo === valor}
                    onSelect={() => {
                      eligio.current = true
                      onElegir(opcion)
                      cambiarAbierto(false)
                    }}
                  >
                    {contenido(opcion)}
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
