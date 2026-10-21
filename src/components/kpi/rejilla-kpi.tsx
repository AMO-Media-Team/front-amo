import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { TarjetaKpi } from "./tarjeta-kpi"

const COLUMNAS = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-3 xl:grid-cols-5",
  6: "lg:grid-cols-3 xl:grid-cols-6",
} as const

interface RejillaKpiProps {
  /** Nombre del grupo para lectores de pantalla ("Indicadores del periodo"). */
  etiqueta: string
  columnas?: keyof typeof COLUMNAS
  className?: string
  children: ReactNode
}

/**
 * Rejilla responsive de tarjetas KPI: dos columnas desde móvil (las cifras son
 * compactas), tres en tableta y 3–6 en escritorio. Sin desbordes: cada celda
 * puede encogerse (`min-w-0`).
 */
export function RejillaKpi({
  etiqueta,
  columnas = 4,
  className,
  children,
}: RejillaKpiProps) {
  return (
    <section
      aria-label={etiqueta}
      className={cn(
        "grid grid-cols-2 gap-3 *:min-w-0 sm:gap-4 md:grid-cols-3",
        COLUMNAS[columnas],
        className
      )}
    >
      {children}
    </section>
  )
}

/** Fallback fiel de la rejilla para `<Suspense>` y `loading.tsx`. */
export function EsqueletoRejillaKpi({
  cantidad = 8,
  columnas = 4,
  className,
}: {
  cantidad?: number
  columnas?: keyof typeof COLUMNAS
  className?: string
}) {
  return (
    <RejillaKpi
      etiqueta="Cargando indicadores"
      columnas={columnas}
      className={className}
    >
      {Array.from({ length: cantidad }, (_, i) => (
        <TarjetaKpi
          key={i}
          titulo="Indicador"
          valor={null}
          cargando
          indice={i}
        />
      ))}
    </RejillaKpi>
  )
}
