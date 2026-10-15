"use client"

import { Building2, ChevronsUpDown, Megaphone } from "lucide-react"
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
import { MENSAJE_INESPERADO } from "@/features/usuarios/errores"
import { cn } from "@/lib/utils"

import { buscarObjetivosComision } from "../actions"
import { LIMITE_BUSQUEDA_OBJETIVOS } from "../schemas"
import type { ObjetivoComision } from "../tipos"
import { useValorPausado } from "./use-valor-pausado"

type TipoObjetivo = ObjetivoComision["tipo"]

const TEXTOS: Readonly<
  Record<
    TipoObjetivo,
    { vacio: string; buscar: string; ninguno: string; primeros: string }
  >
> = {
  anunciante: {
    vacio: "Busca un anunciante",
    buscar: "Nombre o razón social…",
    ninguno: "Ningún anunciante coincide.",
    primeros: `Se muestran los primeros ${LIMITE_BUSQUEDA_OBJETIVOS}. Escribe para encontrar otro.`,
  },
  campana: {
    vacio: "Busca una campaña",
    buscar: "Nombre o marca de la campaña…",
    ninguno: "Ninguna campaña coincide.",
    primeros: `Se muestran las ${LIMITE_BUSQUEDA_OBJETIVOS} más recientes. Escribe para encontrar otra.`,
  },
}

/** Con `datos_sensibles.ver` el servidor también busca por NIT. */
const BUSCAR_CON_NIT = "Nombre, razón social o NIT…"

/**
 * Anunciante o campaña a la que aplica una excepción. La búsqueda corre en el
 * servidor con la RLS de quien busca (solo aparece lo que puede ver).
 */
export function SelectorObjetivo({
  tipo,
  valor,
  onCambio,
  id,
  invalido,
  deshabilitado,
  buscaPorNit = false,
}: {
  tipo: TipoObjetivo
  valor: ObjetivoComision | null
  onCambio: (objetivo: ObjetivoComision) => void
  id?: string
  invalido?: boolean
  deshabilitado?: boolean
  /** Quien busca tiene `datos_sensibles.ver`: el campo lo anuncia. */
  buscaPorNit?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState("")
  const consulta = useValorPausado(texto)
  const [encontrados, setEncontrados] = useState<ObjetivoComision[]>([])
  const [error, setError] = useState<string | null>(null)
  const [consultando, iniciar] = useTransition()
  // Al pasar de «anunciante» a «campaña» quedan en memoria los resultados del
  // otro tipo hasta que llega la nueva búsqueda: nunca se ofrecen (elegir uno
  // guardaría el id de un anunciante como campaña).
  const resultados = encontrados.filter((objetivo) => objetivo.tipo === tipo)
  // También cuenta como búsqueda en curso la pausa entre la tecla y la consulta.
  const buscando = consultando || texto !== consulta
  const idLista = useId()
  const textos = TEXTOS[tipo]
  const Icono = tipo === "anunciante" ? Building2 : Megaphone

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    iniciar(async () => {
      try {
        const resultado = await buscarObjetivosComision({
          objetivo: tipo,
          q: consulta,
        })
        if (!vigente) return
        if (resultado.ok) {
          setEncontrados(resultado.datos)
          setError(null)
        } else {
          setError(resultado.error)
        }
      } catch {
        // Sin red la acción lanza: el aviso va en la lista, no al límite de error.
        if (vigente) setError(MENSAJE_INESPERADO)
      }
    })
    return () => {
      vigente = false
    }
  }, [abierto, consulta, tipo])

  // Cada apertura empieza sin texto: lo buscado la vez anterior (o para el
  // otro tipo de destinatario) no debe filtrar la lista al volver a abrir.
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
            className="h-auto min-h-9 w-full justify-between py-1.5 font-normal"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2 text-left">
          <Icono
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          {valor ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{valor.nombre}</span>
              {valor.detalle ? (
                <span className="truncate text-xs text-muted-foreground">
                  {valor.detalle}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">{textos.vacio}</span>
          )}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder={
              tipo === "anunciante" && buscaPorNit
                ? BUSCAR_CON_NIT
                : textos.buscar
            }
          />
          <CommandList id={idLista}>
            {error ? (
              <p
                role="alert"
                className="px-3 py-6 text-center text-sm text-destructive"
              >
                {error}
              </p>
            ) : buscando && resultados.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Spinner aria-label="Buscando" />
                Buscando…
              </div>
            ) : (
              <CommandEmpty>{textos.ninguno}</CommandEmpty>
            )}
            <CommandGroup className={cn(buscando && "opacity-70")}>
              {resultados.map((objetivo) => (
                <CommandItem
                  key={objetivo.id}
                  value={objetivo.id}
                  data-checked={objetivo.id === valor?.id}
                  onSelect={() => {
                    onCambio(objetivo)
                    cambiarAbierto(false)
                  }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{objetivo.nombre}</span>
                    {objetivo.detalle ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {objetivo.detalle}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {/* La lista viene recortada: sin este aviso parecería que no hay más. */}
            {!error && resultados.length >= LIMITE_BUSQUEDA_OBJETIVOS ? (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                {textos.primeros}
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
