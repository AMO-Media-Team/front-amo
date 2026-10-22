import type { ReactNode } from "react"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/**
 * Esqueletos fieles de «Mi medio»: misma rejilla, mismas tarjetas y alturas
 * parecidas, para que la página no salte al llegar los datos.
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

/**
 * `loading.tsx` de las secciones de «Mi medio»: mismo contenedor que
 * `ContenedorPagina` (sin la transición, que corre al llegar la página), el
 * encabezado de la sección y el esqueleto del contenido.
 */
export function EsqueletoPaginaMiMedio({
  estrecha = false,
  children,
}: {
  /** Formularios: el ancho `estrecho` de `ContenedorPagina`. */
  estrecha?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        estrecha ? "max-w-3xl" : "max-w-7xl"
      )}
    >
      <EsqueletoEncabezadoSeccion />
      {children}
    </div>
  )
}

/** Encabezado de sección: vuelta, título y descripción. */
export function EsqueletoEncabezadoSeccion() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Esqueleto className="h-5 w-24" />
      <Esqueleto className="h-8 w-3/5 max-w-72" />
      <Esqueleto className="h-4 w-11/12 max-w-xl" />
    </div>
  )
}

/** `AltaMedio`: situación, lista de cinco pasos y la columna de orientación. */
export function EsqueletoAltaMedio({ className }: { className?: string }) {
  return (
    <Zona
      etiqueta="Cargando tu medio…"
      className={cn(
        "grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <Tarjeta>
          <div className="flex items-start gap-4">
            <Esqueleto className="size-16 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-6 w-3/5" />
              <Esqueleto className="h-4 w-full" />
              <Esqueleto className="h-4 w-4/5" />
            </div>
          </div>
        </Tarjeta>
        <div className="flex flex-col overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-col gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <div className="flex justify-between gap-3">
              <Esqueleto className="h-5 w-32" />
              <Esqueleto className="h-4 w-12" />
            </div>
            <Esqueleto className="h-2 w-full rounded-full" />
          </div>
          <div className="divide-y border-t">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex min-h-18 items-center gap-3 px-4 py-3.5 sm:px-5"
              >
                <Esqueleto className="size-10 rounded-xl" />
                <div className="flex flex-1 flex-col gap-2">
                  <Esqueleto className="h-4 w-2/5" />
                  <Esqueleto className="h-3.5 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
        <Tarjeta className="p-4 sm:p-5">
          <Esqueleto className="h-5 w-28" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Esqueleto className="size-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Esqueleto className="h-4 w-1/2" />
                <Esqueleto className="h-3 w-full" />
              </div>
            </div>
          ))}
        </Tarjeta>
      </div>
    </Zona>
  )
}

/** Formulario por secciones (perfil, pago): tarjetas con campos. */
export function EsqueletoFormulario({
  secciones = 3,
  etiqueta,
}: {
  secciones?: number
  etiqueta: string
}) {
  return (
    <Zona etiqueta={etiqueta} className="flex flex-col gap-5">
      {Array.from({ length: secciones }, (_, i) => (
        <Tarjeta key={i}>
          <div className="flex items-start gap-3.5">
            <Esqueleto className="size-9 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-5 w-2/5" />
              <Esqueleto className="h-3.5 w-4/5" />
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[0, 1].map((j) => (
              <div key={j} className="flex flex-col gap-2">
                <Esqueleto className="h-4 w-28" />
                <Esqueleto className="h-9 w-full" />
              </div>
            ))}
          </div>
        </Tarjeta>
      ))}
    </Zona>
  )
}

/** Página de nivel: nivel y tope, documentos, camino y los tres niveles. */
export function EsqueletoNivel() {
  return (
    <Zona etiqueta="Cargando tu nivel…" className="flex flex-col gap-5">
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4 sm:gap-5">
          <Tarjeta className="p-4 sm:p-5">
            <Esqueleto className="h-5 w-28" />
            <div className="flex items-center gap-3">
              <Esqueleto className="size-12 rounded-2xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Esqueleto className="h-5 w-3/5" />
                <Esqueleto className="h-4 w-1/4" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Esqueleto className="h-14 rounded-xl" />
              <Esqueleto className="h-14 rounded-xl" />
            </div>
          </Tarjeta>
          <Tarjeta className="p-4 sm:p-5">
            <Esqueleto className="h-5 w-40" />
            <Esqueleto className="h-8 w-1/2" />
            <Esqueleto className="h-3 w-full rounded-full" />
            <Esqueleto className="h-3.5 w-4/5" />
          </Tarjeta>
        </div>
        <Tarjeta className="p-4 sm:p-5">
          <Esqueleto className="h-5 w-44" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Esqueleto className="size-8 rounded-lg" />
              <Esqueleto className="h-4 flex-1" />
              <Esqueleto className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </Tarjeta>
      </div>
      <Tarjeta>
        <Esqueleto className="h-6 w-56" />
        <Esqueleto className="h-4 w-4/5" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Esqueleto className="size-6 rounded-full" />
            <Esqueleto className="h-4 flex-1" />
          </div>
        ))}
        <Esqueleto className="h-9 w-44" />
      </Tarjeta>
    </Zona>
  )
}
