"use client"

import { ArrowDownUp, Search, X } from "lucide-react"
import { type ReactNode, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { type FiltroFacetado, FiltroFacetadoTabla } from "./filtro-facetado"

export interface OpcionOrden {
  /** `campo.asc` / `campo.desc`. */
  valor: string
  etiqueta: string
}

interface BarraHerramientasProps {
  busqueda: string
  placeholderBusqueda: string
  onBuscar: (texto: string) => void
  filtros: readonly FiltroFacetado[]
  valoresFiltro: (clave: string) => readonly string[]
  onFiltrar: (clave: string, valores: readonly string[]) => void
  filtrosActivos: boolean
  onLimpiar: () => void
  /** Selector de orden para la vista de tarjetas (móvil), que no tiene cabeceras. */
  ordenMovil: {
    valor: string
    opciones: readonly OpcionOrden[]
    onCambiar: (valor: string) => void
  }
  /** Controles de la derecha (vista, exportación). */
  children?: ReactNode
}

function esCampoEditable(elemento: Element | null): boolean {
  return (
    elemento instanceof HTMLElement &&
    (elemento.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(elemento.tagName))
  )
}

/** Búsqueda (atajo "/"), filtros facetados, limpiar y controles de vista. */
export function BarraHerramientas({
  busqueda,
  placeholderBusqueda,
  onBuscar,
  filtros,
  valoresFiltro,
  onFiltrar,
  filtrosActivos,
  onLimpiar,
  ordenMovil,
  children,
}: BarraHerramientasProps) {
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function enfocarConBarra(evento: KeyboardEvent) {
      if (evento.key !== "/" || evento.metaKey || evento.ctrlKey) return
      if (esCampoEditable(document.activeElement)) return
      evento.preventDefault()
      campo.current?.focus()
    }
    window.addEventListener("keydown", enfocarConBarra)
    return () => window.removeEventListener("keydown", enfocarConBarra)
  }, [])

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <InputGroup className="w-full bg-card sm:w-72 dark:bg-input/30">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={campo}
            type="search"
            value={busqueda}
            onChange={(evento) => onBuscar(evento.target.value)}
            placeholder={placeholderBusqueda}
            aria-label={placeholderBusqueda}
            autoComplete="off"
            spellCheck={false}
            className="[&::-webkit-search-cancel-button]:hidden"
          />
          <InputGroupAddon align="inline-end">
            {busqueda ? (
              <InputGroupButton
                size="icon-xs"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  onBuscar("")
                  campo.current?.focus()
                }}
              >
                <X aria-hidden />
              </InputGroupButton>
            ) : (
              <Kbd className="max-sm:hidden" aria-hidden>
                /
              </Kbd>
            )}
          </InputGroupAddon>
        </InputGroup>

        {filtros.map((filtro) => (
          <FiltroFacetadoTabla
            key={filtro.clave}
            filtro={filtro}
            seleccionados={valoresFiltro(filtro.clave)}
            onCambiar={(valores) => onFiltrar(filtro.clave, valores)}
          />
        ))}

        {filtrosActivos ? (
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            Limpiar
            <X data-icon="inline-end" aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ordenMovil.opciones.length > 0 ? (
          <Select
            value={ordenMovil.valor}
            items={ordenMovil.opciones.map(({ valor, etiqueta }) => ({
              value: valor,
              label: etiqueta,
            }))}
            onValueChange={(valor) => {
              if (typeof valor === "string") ordenMovil.onCambiar(valor)
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="Ordenar por"
              className="max-w-full min-w-0 md:hidden"
            >
              <ArrowDownUp aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ordenMovil.opciones.map((opcion) => (
                <SelectItem key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {children}
      </div>
    </div>
  )
}
