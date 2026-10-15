"use client"

import NumberFlow from "@number-flow/react"

import { LOCALE } from "@/lib/format"
import { cn } from "@/lib/utils"

import { cifraAnimada, type FormatoNumero } from "./cifra-animada"

export type { FormatoNumero }

interface NumeroAnimadoProps {
  valor: number
  formato?: FormatoNumero
  /** Decimales para "numero" (máximo) y "porcentaje" (fijos). */
  decimales?: number
  className?: string
  prefijo?: string
  sufijo?: string
}

/**
 * Cifra que anima sus dígitos al cambiar (NumberFlow). Usa las mismas opciones
 * de Intl y la misma notación compacta que `@/lib/format` (ver `cifraAnimada`),
 * así el texto coincide con tablas y exportaciones. NumberFlow respeta
 * `prefers-reduced-motion` por defecto.
 */
export function NumeroAnimado({
  valor,
  formato = "numero",
  decimales = formato === "porcentaje" ? 1 : 0,
  className,
  prefijo = "",
  sufijo = "",
}: NumeroAnimadoProps) {
  const cifra = cifraAnimada(
    Number.isFinite(valor) ? valor : 0,
    formato,
    decimales
  )
  return (
    <NumberFlow
      value={cifra.valor}
      locales={LOCALE}
      format={cifra.formato}
      prefix={`${prefijo}${cifra.prefijo}`}
      suffix={`${cifra.sufijo}${sufijo}`}
      className={cn("cifras", className)}
    />
  )
}
