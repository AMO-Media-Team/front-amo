"use client"

import { Search, X } from "lucide-react"
import { useRef } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

/**
 * Búsqueda del listado y de la matriz: lupa, texto y botón para limpiar. Oculta
 * el aspa nativa de `type="search"` (se vería duplicada junto a la propia) y,
 * al limpiar, devuelve el foco al campo (el botón desaparece).
 */
export function CampoBusqueda({
  etiqueta,
  placeholder,
  valor,
  onCambio,
  className,
}: {
  /** Nombre accesible del campo. */
  etiqueta: string
  placeholder: string
  valor: string
  /** Texto nuevo; cadena vacía al limpiar. */
  onCambio: (valor: string) => void
  className?: string
}) {
  const campo = useRef<HTMLInputElement>(null)
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        ref={campo}
        type="search"
        aria-label={etiqueta}
        placeholder={placeholder}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      {valor ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Limpiar búsqueda"
            onClick={() => {
              onCambio("")
              campo.current?.focus()
            }}
          >
            <X aria-hidden />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}
