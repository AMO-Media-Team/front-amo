import type { ReactNode } from "react"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/**
 * Esqueletos fieles de «Mi empresa»: misma rejilla, mismas tarjetas y alturas
 * parecidas, para que la página no salte al llegar los datos. Cada zona se
 * anuncia una sola vez a los lectores de pantalla.
 */

function Zona({
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

function Tarjeta({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:p-6",
        className
      )}
    >
      {children}
    </div>
  )
}

function TarjetaFormulario({ campos }: { campos: number }) {
  return (
    <Tarjeta>
      <div className="flex items-start gap-3.5">
        <Esqueleto className="size-9 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <Esqueleto className="h-5 w-2/5" />
          <Esqueleto className="h-3.5 w-4/5" />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {Array.from({ length: campos }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Esqueleto className="h-4 w-28" />
            <Esqueleto className="h-9 w-full" />
          </div>
        ))}
      </div>
    </Tarjeta>
  )
}

/** «Mi empresa»: verificación con sus pasos, formularios y el logo al lado. */
export function EsqueletoEmpresa() {
  return (
    <Zona
      etiqueta="Cargando los datos de tu empresa…"
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Tarjeta>
          <div className="flex items-start gap-4">
            <Esqueleto className="size-12 rounded-2xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-6 w-3/5" />
              <Esqueleto className="h-4 w-full" />
              <Esqueleto className="h-4 w-4/5" />
            </div>
          </div>
          <Esqueleto className="h-2 w-full rounded-full" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Esqueleto className="size-10 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Esqueleto className="h-4 w-2/5" />
                <Esqueleto className="h-3.5 w-4/5" />
              </div>
            </div>
          ))}
        </Tarjeta>
        <TarjetaFormulario campos={6} />
        <TarjetaFormulario campos={4} />
      </div>
      <Tarjeta className="p-4 sm:p-5">
        <Esqueleto className="h-5 w-20" />
        <Esqueleto className="size-20 rounded-2xl" />
        <Esqueleto className="h-28 w-full rounded-xl" />
      </Tarjeta>
    </Zona>
  )
}

/** «Mi empresa › Equipo»: lista de personas y la nota al lado. */
export function EsqueletoEquipo() {
  return (
    <Zona
      etiqueta="Cargando tu equipo…"
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
    >
      <div className="flex flex-col overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-start gap-3 border-b px-4 py-4 sm:px-5">
          <Esqueleto className="size-9 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Esqueleto className="h-5 w-40" />
            <Esqueleto className="h-3.5 w-28" />
          </div>
        </div>
        <div className="divide-y">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
            >
              <Esqueleto className="size-6 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Esqueleto className="h-4 w-2/5" />
                <Esqueleto className="h-3 w-3/5" />
              </div>
              <Esqueleto className="hidden h-6 w-20 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
      <Esqueleto className="h-36 w-full rounded-lg" />
    </Zona>
  )
}
