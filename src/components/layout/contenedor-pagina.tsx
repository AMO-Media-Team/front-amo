import type { ReactNode } from "react"

import { TransicionPagina } from "@/components/motion/transicion-vista"
import { cn } from "@/lib/utils"

const ANCHOS = {
  normal: "max-w-7xl",
  estrecho: "max-w-3xl",
  completo: "max-w-none",
} as const

interface ContenedorPaginaProps {
  children: ReactNode
  /** `estrecho` para formularios y fichas; `completo` para el mapa. */
  ancho?: keyof typeof ANCHOS
  className?: string
}

/**
 * Envoltura de cada `page.tsx` dentro del AppShell: márgenes, ancho máximo
 * y la transición de entrada/salida al navegar (View Transitions).
 */
export function ContenedorPagina({
  children,
  ancho = "normal",
  className,
}: ContenedorPaginaProps) {
  return (
    <TransicionPagina>
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
          ANCHOS[ancho],
          className
        )}
      >
        {children}
      </div>
    </TransicionPagina>
  )
}
