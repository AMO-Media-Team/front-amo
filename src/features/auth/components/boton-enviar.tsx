"use client"

import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface BotonEnviarProps {
  children: ReactNode
  /** Texto mientras la acción está en curso (p. ej. "Ingresando…"). */
  textoPendiente: string
  /** Fuerza el estado pendiente (p. ej. acciones invocadas fuera del form). */
  pendiente?: boolean
  deshabilitado?: boolean
  className?: string
}

/** Botón principal de los formularios de acceso: ocupa el ancho y muestra el progreso. */
export function BotonEnviar({
  children,
  textoPendiente,
  pendiente: pendienteForzado = false,
  deshabilitado = false,
  className,
}: BotonEnviarProps) {
  const { pending } = useFormStatus()
  const pendiente = pending || pendienteForzado

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pendiente || deshabilitado}
      aria-disabled={pendiente || deshabilitado}
      className={cn(
        "group/enviar h-11 w-full text-[0.9375rem] shadow-glow",
        className
      )}
    >
      {pendiente ? (
        <>
          <Spinner aria-hidden data-icon="inline-start" />
          <span aria-live="polite">{textoPendiente}</span>
        </>
      ) : (
        <>
          {children}
          <ArrowRight
            aria-hidden
            data-icon="inline-end"
            className="transition-transform duration-150 group-hover/enviar:translate-x-0.5"
          />
        </>
      )}
    </Button>
  )
}
