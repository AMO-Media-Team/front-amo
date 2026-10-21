"use client"

import { RotateCcw } from "lucide-react"
import { type ReactNode, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import { IlustracionError } from "./ilustraciones"

interface EstadoErrorProps {
  titulo?: string
  descripcion?: ReactNode
  /** Reintento (p. ej. `retry` de error.tsx o `refetch` de React Query). */
  onReintentar?: () => void
  /** Identificador del error en los logs del servidor (`error.digest`). */
  digest?: string
  /** Acciones adicionales junto a "Reintentar". */
  children?: ReactNode
  /** Versión reducida para widgets (sin ilustración grande). */
  compacto?: boolean
  /** "h1" cuando el error ocupa la página entera (error.tsx); "h2"/"h3" en secciones. */
  nivelTitulo?: "h1" | "h2" | "h3"
  className?: string
}

export function EstadoError({
  titulo = "Algo salió mal",
  descripcion = "No pudimos cargar esta sección. Intenta de nuevo en unos segundos.",
  onReintentar,
  digest,
  children,
  compacto = false,
  nivelTitulo: Titulo = "h2",
  className,
}: EstadoErrorProps) {
  const [reintentando, iniciarReintento] = useTransition()

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-4 text-center text-balance",
        compacto ? "p-4" : "p-6",
        className
      )}
    >
      <IlustracionError
        className={cn(
          "text-foreground",
          compacto ? "h-20 w-auto" : "h-36 w-auto"
        )}
      />
      <div className="flex max-w-sm flex-col gap-1.5">
        <Titulo
          className={cn("font-semibold", compacto ? "text-sm" : "text-lg")}
        >
          {titulo}
        </Titulo>
        <p className="text-sm text-muted-foreground">{descripcion}</p>
        {digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            Código de referencia: <span className="select-all">{digest}</span>
          </p>
        ) : null}
      </div>
      {onReintentar || children ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onReintentar ? (
            <Button
              onClick={() => iniciarReintento(onReintentar)}
              disabled={reintentando}
            >
              {reintentando ? (
                <Spinner aria-label="Reintentando" data-icon="inline-start" />
              ) : (
                <RotateCcw data-icon="inline-start" aria-hidden />
              )}
              Reintentar
            </Button>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  )
}
