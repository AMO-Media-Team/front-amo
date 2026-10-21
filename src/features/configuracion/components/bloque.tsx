import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Rejilla del encabezado. Se adapta al ancho de la TARJETA (no al de la
 * ventana): en tarjetas angostas las acciones bajan a su propia fila; desde
 * 22rem suben a la fila del título y la descripción ocupa todo el ancho.
 */
const REJILLA = {
  conIcono: {
    columnas:
      "grid-cols-[auto_minmax(0,1fr)] @[22rem]:grid-cols-[auto_minmax(0,1fr)_auto]",
    texto: "col-start-2",
    acciones: "@[22rem]:col-start-3",
  },
  sinIcono: {
    columnas:
      "grid-cols-[minmax(0,1fr)] @[22rem]:grid-cols-[minmax(0,1fr)_auto]",
    texto: "col-start-1",
    acciones: "@[22rem]:col-start-2",
  },
} as const

/**
 * Cuadrícula de celdas separadas por líneas dentro de un `Bloque`. Cada celda
 * dibuja su borde derecho e inferior y la cuadrícula esconde los del borde
 * exterior (el bloque recorta): una última fila incompleta no deja huecos de
 * otro color, sea cual sea el número de columnas.
 */
export const CUADRICULA_DIVIDIDA = "-mr-px -mb-px grid"
export const CELDA_DIVIDIDA = "border-r border-b"

/**
 * Tarjeta de un grupo de configuración: encabezado (icono, título,
 * descripción y acciones) y cuerpo. `id` permite enlazar al grupo.
 */
export function Bloque({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  insignias,
  children,
  id,
  className,
  cuerpoClassName,
}: {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  /** Botones a la derecha del encabezado. */
  acciones?: ReactNode
  /** Insignias junto al título (pendiente de validación, solo lectura…). */
  insignias?: ReactNode
  children: ReactNode
  id?: string
  className?: string
  cuerpoClassName?: string
}) {
  const idTitulo = id ? `${id}-titulo` : undefined
  const rejilla = Icono ? REJILLA.conIcono : REJILLA.sinIcono
  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-xl border bg-card text-card-foreground",
        className
      )}
    >
      <header className="@container border-b px-4 py-3.5 sm:px-5">
        <div
          className={cn("grid items-start gap-x-3 gap-y-0.5", rejilla.columnas)}
        >
          {Icono ? (
            <span
              aria-hidden
              className="col-start-1 row-span-2 row-start-1 mt-0.5 grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <Icono className="size-4" />
            </span>
          ) : null}
          <div
            className={cn(
              "row-start-1 flex min-h-7 min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
              rejilla.texto
            )}
          >
            <h3
              id={idTitulo}
              className="font-heading text-[0.9375rem] leading-snug font-semibold"
            >
              {titulo}
            </h3>
            {insignias}
          </div>
          {descripcion ? (
            <p
              className={cn(
                "row-start-2 max-w-3xl text-sm text-pretty text-muted-foreground @[22rem]:-col-end-1",
                rejilla.texto
              )}
            >
              {descripcion}
            </p>
          ) : null}
          {acciones ? (
            <div
              className={cn(
                "col-span-full row-start-3 mt-2.5 flex flex-wrap items-center gap-2 @[22rem]:row-start-1 @[22rem]:mt-0 @[22rem]:justify-end",
                rejilla.acciones
              )}
            >
              {acciones}
            </div>
          ) : null}
        </div>
      </header>
      <div className={cn("flex flex-col", cuerpoClassName)}>{children}</div>
    </section>
  )
}
