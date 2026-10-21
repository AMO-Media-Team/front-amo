import { ArrowRight, type LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { type ReactNode, useId } from "react"

import { cn } from "@/lib/utils"

interface TarjetaPanelProps {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  /** Controles a la derecha del título (selector, cifra destacada…). */
  acciones?: ReactNode
  /** Enlace "Ver todo" al pie, hacia la pantalla con el detalle. */
  enlace?: { href: Route; texto: string }
  pie?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Contenedor de los bloques del panel que no son un gráfico de Chart.js
 * (listas, mini-mapa, salud de medios): mismo borde, relleno y jerarquía de
 * título que `TarjetaGrafico`, para que la rejilla se lea como un sistema.
 */
export function TarjetaPanel({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  enlace,
  pie,
  className,
  children,
}: TarjetaPanelProps) {
  const idTitulo = useId()
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 transition-colors duration-300 hover:border-foreground/15 sm:p-5",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={idTitulo}
            className="flex items-center gap-2 font-heading text-[0.9375rem] leading-snug font-semibold"
          >
            {Icono ? (
              <Icono aria-hidden className="size-4 shrink-0 text-primary" />
            ) : null}
            {titulo}
          </h2>
          {descripcion ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              {descripcion}
            </p>
          ) : null}
        </div>
        {acciones ? (
          <div className="-mt-1 flex shrink-0 items-center gap-1">
            {acciones}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {pie || enlace ? (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {pie ? <div className="min-w-0">{pie}</div> : <span />}
          {enlace ? (
            <Link
              href={enlace.href}
              className="group/enlace inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:anillo-foco"
            >
              {enlace.texto}
              <ArrowRight
                aria-hidden
                className="size-3.5 transition-transform duration-200 group-hover/enlace:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          ) : null}
        </footer>
      ) : null}
    </section>
  )
}
