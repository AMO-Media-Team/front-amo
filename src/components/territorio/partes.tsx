"use client"

import { CircleAlert, MapPin, MapPinned, RotateCcw, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** Lo mínimo de una consulta de React Query que necesitan las listas. */
export interface EstadoConsulta {
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => unknown
}

/**
 * Estados de una lista de territorio dentro de un buscador: cargando
 * (esqueleto con la forma de las filas), error con reintento, o sin
 * coincidencias. `null` cuando hay filas que mostrar.
 */
export function EstadoLista({
  consulta,
  hayDatos,
  hayFilas,
  textoVacio,
}: {
  consulta: EstadoConsulta
  /** Ya hay una lista (aunque un refresco posterior haya fallado). */
  hayDatos: boolean
  hayFilas: boolean
  textoVacio: string
}) {
  if (!hayDatos && consulta.isPending) {
    return (
      <div role="status" className="flex flex-col gap-1 p-1">
        <span className="sr-only">Cargando…</span>
        {[72, 56, 64, 48, 60].map((ancho) => (
          <div key={ancho} className="flex h-8 items-center px-2">
            <Skeleton className="h-3.5" style={{ width: `${ancho}%` }} />
          </div>
        ))}
      </div>
    )
  }
  if (!hayDatos && consulta.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-2 px-3 py-5 text-center text-sm"
      >
        <CircleAlert aria-hidden className="size-5 text-destructive" />
        <p className="text-muted-foreground">
          {consulta.error?.message ?? "No pudimos cargar la lista."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void consulta.refetch()}
        >
          <RotateCcw data-icon="inline-start" aria-hidden />
          Reintentar
        </Button>
      </div>
    )
  }
  if (!hayFilas) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {textoVacio}
      </p>
    )
  }
  return null
}

export type EstadoFicha = "listo" | "cargando" | "no-disponible"

/**
 * Ficha de un territorio elegido, con su botón para quitarlo. Una ficha «no
 * disponible» es un código guardado que ya no está activo: se marca y se
 * explica (la BD lo rechazaría al guardar).
 */
export function FichaTerritorio({
  titulo,
  detalle,
  tipo,
  estado = "listo",
  onQuitar,
  deshabilitado,
}: {
  titulo: string
  detalle?: ReactNode
  tipo: "departamento" | "municipio"
  estado?: EstadoFicha
  onQuitar: () => void
  deshabilitado?: boolean
}) {
  const Icono = tipo === "departamento" ? MapPinned : MapPin
  const noDisponible = estado === "no-disponible"
  return (
    <li
      className={cn(
        "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-card pr-1 pl-2.5 text-sm",
        noDisponible && "border-destructive/50 bg-destructive/8"
      )}
    >
      <Icono
        aria-hidden
        className={cn(
          "size-3.5 shrink-0",
          noDisponible ? "text-destructive" : "text-primary"
        )}
      />
      {estado === "cargando" ? (
        <>
          <Skeleton aria-hidden className="h-3 w-20" />
          <span className="sr-only">Cargando el nombre…</span>
        </>
      ) : (
        <span className="min-w-0 truncate font-medium" title={titulo}>
          {titulo}
        </span>
      )}
      {detalle || noDisponible ? (
        <span
          className={cn(
            "shrink-0 text-xs",
            noDisponible ? "text-destructive" : "text-muted-foreground"
          )}
        >
          · {noDisponible ? "ya no está activo" : detalle}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onQuitar}
        disabled={deshabilitado}
        aria-label={`Quitar ${titulo}`}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:anillo-foco disabled:opacity-50"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  )
}
