"use client"

import { ChevronsUpDown, Globe } from "lucide-react"
import { useId, useMemo, useState } from "react"

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
import { banderaEmoji } from "@/features/accesos/catalogo"
import { cn } from "@/lib/utils"

import { filtrarPaises } from "../busqueda-paises"
import { PAIS_COLOMBIA } from "../schemas"
import type { OpcionPais } from "../tipos"

function NombrePais({ pais }: { pais: OpcionPais }) {
  const bandera = banderaEmoji(pais.iso2)
  return (
    <span className="flex min-w-0 items-center gap-2">
      {bandera ? (
        <span aria-hidden className="text-base leading-none">
          {bandera}
        </span>
      ) : null}
      <span className="truncate">{pais.nombre}</span>
    </span>
  )
}

/**
 * País del anunciante con búsqueda (nombre en español o código ISO, sin
 * acentos). Colombia va primero: es el caso habitual.
 */
export function SelectorPais({
  id,
  valor,
  paises,
  onCambio,
  invalido,
  deshabilitado,
}: {
  id?: string
  /** ISO2 elegido. */
  valor: string
  paises: readonly OpcionPais[]
  onCambio: (iso2: string) => void
  invalido?: boolean
  deshabilitado?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const idLista = useId()
  const elegido = paises.find((pais) => pais.iso2 === valor)
  const colombia = paises.find((pais) => pais.iso2 === PAIS_COLOMBIA)
  const resultados = useMemo(
    () => filtrarPaises(paises, texto),
    [paises, texto]
  )

  // Cada apertura empieza sin texto: lo buscado antes no filtra la lista.
  function cambiarAbierto(siguiente: boolean) {
    setAbierto(siguiente)
    if (!siguiente) setTexto("")
  }

  function elegir(iso2: string) {
    onCambio(iso2)
    cambiarAbierto(false)
  }

  const item = (pais: OpcionPais) => (
    <CommandItem
      key={pais.iso2}
      value={pais.iso2}
      data-checked={pais.iso2 === valor}
      onSelect={() => elegir(pais.iso2)}
    >
      <NombrePais pais={pais} />
    </CommandItem>
  )

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
            className="w-full justify-between font-normal"
          />
        }
      >
        {elegido ? (
          <NombrePais pais={elegido} />
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Globe aria-hidden className="size-4" />
            Elige el país
          </span>
        )}
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder="Nombre o código (CO, US…)"
          />
          <CommandList id={idLista}>
            <CommandEmpty>Ningún país coincide.</CommandEmpty>
            {texto.trim() === "" && colombia ? (
              <CommandGroup heading="Habitual">{item(colombia)}</CommandGroup>
            ) : null}
            <CommandGroup
              heading={texto.trim() === "" ? "Todos los países" : undefined}
              className={cn(resultados.length === 0 && "hidden")}
            >
              {resultados.map((pais) =>
                texto.trim() === "" && pais.iso2 === PAIS_COLOMBIA
                  ? null
                  : item(pais)
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
