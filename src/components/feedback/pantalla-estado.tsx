import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { ID_CONTENIDO } from "./salto-contenido"

interface PantallaEstadoProps {
  children: ReactNode
  className?: string
}

/**
 * Lienzo de página completa para 404, errores y estados globales: rejilla que
 * se desvanece y un halo Aurora detrás del contenido centrado.
 */
export function PantallaEstado({ children, className }: PantallaEstadoProps) {
  return (
    <main
      id={ID_CONTENIDO}
      tabIndex={-1}
      className={cn(
        "relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-6 py-16 outline-none",
        className
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 patron-rejilla" />
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 -z-10 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-aurora opacity-15 blur-3xl dark:opacity-20"
      />
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center motion-safe:animate-aparecer-arriba">
        {children}
      </div>
    </main>
  )
}
