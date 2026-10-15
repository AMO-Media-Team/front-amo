"use client"

import { ChevronsUpDown, MapPin } from "lucide-react"
import { useEffect, useId, useState, useTransition } from "react"

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
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { buscarMunicipios } from "../actions"
import type { OpcionMunicipio } from "../queries"
import { useValorPausado } from "./use-valor-pausado"

/**
 * Selector de un municipio DIVIPOLA con búsqueda (nombre o código, sin
 * acentos). La búsqueda corre en el servidor sobre el diccionario local: no
 * se envían los 1.122 municipios al navegador.
 */
export function SelectorMunicipio({
  valor,
  etiqueta,
  onCambio,
  id,
  invalido,
  deshabilitado,
  className,
}: {
  /** Código DIVIPOLA elegido ('' si ninguno). */
  valor: string
  /** Nombre a mostrar del valor actual ("Bogotá, D.C. · Bogotá"). */
  etiqueta: string | null
  onCambio: (municipio: OpcionMunicipio) => void
  id?: string
  invalido?: boolean
  deshabilitado?: boolean
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const consulta = useValorPausado(texto)
  const [resultados, setResultados] = useState<OpcionMunicipio[]>([])
  const [consultando, iniciar] = useTransition()
  // También cuenta como búsqueda en curso la pausa entre la tecla y la consulta.
  const buscando = consultando || texto !== consulta
  const idLista = useId()

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    iniciar(async () => {
      try {
        const resultado = await buscarMunicipios({ q: consulta || "bogota" })
        if (vigente && resultado.ok) setResultados(resultado.datos)
      } catch {
        // Sin red la acción lanza: se conservan los resultados anteriores.
      }
    })
    return () => {
      vigente = false
    }
  }, [abierto, consulta])

  // Cada apertura empieza sin texto: lo buscado la vez anterior no debe
  // filtrar la lista al volver a abrir.
  function cambiarAbierto(valor: boolean) {
    setAbierto(valor)
    if (!valor) setTexto("")
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
            aria-controls={idLista}
            aria-invalid={invalido || undefined}
            disabled={deshabilitado}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <MapPin
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className={cn("truncate", !valor && "text-muted-foreground")}>
            {valor ? (etiqueta ?? valor) : "Busca un municipio"}
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder="Nombre o código DIVIPOLA…"
          />
          <CommandList id={idLista}>
            {buscando && resultados.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner aria-label="Buscando" />
                Buscando…
              </div>
            ) : (
              <CommandEmpty>Ningún municipio coincide.</CommandEmpty>
            )}
            <CommandGroup className={cn(buscando && "opacity-70")}>
              {resultados.map((municipio) => (
                <CommandItem
                  key={municipio.codigo}
                  value={municipio.codigo}
                  data-checked={municipio.codigo === valor}
                  onSelect={() => {
                    onCambio(municipio)
                    cambiarAbierto(false)
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{municipio.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {municipio.departamento} · {municipio.codigo}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
