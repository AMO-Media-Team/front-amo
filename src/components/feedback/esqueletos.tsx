import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Bloque base con barrido de brillo (se detiene con movimiento reducido). */
export function Esqueleto({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="esqueleto"
      aria-hidden
      className={cn("esqueleto-shimmer rounded-md", className)}
      {...props}
    />
  )
}

/** Anuncia la carga a lectores de pantalla una sola vez por grupo. */
function ZonaCarga({
  etiqueta,
  className,
  children,
}: {
  etiqueta: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{etiqueta}</span>
      {children}
    </div>
  )
}

function TarjetaKpi() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <Esqueleto className="h-3.5 w-24" />
        <Esqueleto className="size-7 rounded-lg" />
      </div>
      <Esqueleto className="h-7 w-32" />
      <div className="flex items-end justify-between gap-4">
        <Esqueleto className="h-3.5 w-16" />
        <Esqueleto className="h-8 w-24" />
      </div>
    </div>
  )
}

export function EsqueletoKpi({ className }: { className?: string }) {
  return (
    <ZonaCarga etiqueta="Cargando indicador…" className={className}>
      <TarjetaKpi />
    </ZonaCarga>
  )
}

export function EsqueletoKpis({
  cantidad = 4,
  className,
}: {
  cantidad?: number
  className?: string
}) {
  return (
    <ZonaCarga
      etiqueta="Cargando indicadores…"
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
    >
      {Array.from({ length: cantidad }, (_, i) => (
        <TarjetaKpi key={i} />
      ))}
    </ZonaCarga>
  )
}

// Anchos fijos (no aleatorios) para que servidor y cliente pinten lo mismo.
const ANCHOS_CELDA = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5"]

export function EsqueletoTabla({
  filas = 8,
  columnas = 5,
  conBarra = true,
  className,
}: {
  filas?: number
  columnas?: number
  /** Incluye la barra de búsqueda y filtros. */
  conBarra?: boolean
  className?: string
}) {
  const plantilla = {
    gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
  }

  return (
    <ZonaCarga
      etiqueta="Cargando tabla…"
      className={cn("flex flex-col gap-3", className)}
    >
      {conBarra ? (
        <div className="flex flex-wrap items-center gap-2">
          <Esqueleto className="h-8 w-full max-w-64" />
          <Esqueleto className="h-8 w-24" />
          <Esqueleto className="ml-auto h-8 w-28" />
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div
          className="grid gap-4 border-b bg-muted/40 px-4 py-3"
          style={plantilla}
        >
          {Array.from({ length: columnas }, (_, c) => (
            <Esqueleto key={c} className="h-3.5 w-2/3" />
          ))}
        </div>
        {Array.from({ length: filas }, (_, f) => (
          <div
            key={f}
            className="grid gap-4 border-b px-4 py-3.5 last:border-b-0"
            style={plantilla}
          >
            {Array.from({ length: columnas }, (_, c) => (
              <Esqueleto
                key={c}
                className={cn(
                  "h-4",
                  ANCHOS_CELDA[(f + c * 2) % ANCHOS_CELDA.length]
                )}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Esqueleto className="h-4 w-32" />
        <Esqueleto className="h-8 w-48" />
      </div>
    </ZonaCarga>
  )
}

const ALTURAS_BARRA = [45, 70, 55, 85, 60, 95, 75, 50, 80, 65, 90, 58]

export function EsqueletoGrafico({
  className,
  alto = "h-64",
}: {
  className?: string
  /** Clase de altura del área del gráfico. */
  alto?: string
}) {
  return (
    <ZonaCarga
      etiqueta="Cargando gráfico…"
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-4 w-40" />
          <Esqueleto className="h-3 w-56 max-w-full" />
        </div>
        <Esqueleto className="h-8 w-28" />
      </div>
      <div className={cn("flex items-end gap-2 border-b pb-px", alto)}>
        {ALTURAS_BARRA.map((altura, i) => (
          <Esqueleto
            key={i}
            className="flex-1 rounded-t-md rounded-b-none"
            style={{ height: `${altura}%` }}
          />
        ))}
      </div>
      <div className="flex justify-center gap-4">
        <Esqueleto className="h-3 w-16" />
        <Esqueleto className="h-3 w-16" />
        <Esqueleto className="h-3 w-16" />
      </div>
    </ZonaCarga>
  )
}
