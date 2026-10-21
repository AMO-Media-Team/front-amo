import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Bloque con título de la ficha de usuario (una tarjeta por tema). */
export function TarjetaFicha({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  children,
  className,
}: {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  acciones?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn("flex flex-col rounded-xl border bg-card", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icono ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icono className="size-4" aria-hidden />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-[0.9375rem] font-semibold">{titulo}</h2>
            {descripcion ? (
              <p className="text-sm text-muted-foreground">{descripcion}</p>
            ) : null}
          </div>
        </div>
        {acciones ? (
          <div className="flex flex-wrap items-center gap-2">{acciones}</div>
        ) : null}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  )
}

/** Lista de pares etiqueta/valor en dos columnas (una en móvil). */
export function ListaDatos({
  datos,
  className,
}: {
  datos: readonly { etiqueta: string; valor: ReactNode; ayuda?: ReactNode }[]
  className?: string
}) {
  return (
    <dl className={cn("grid gap-x-8 gap-y-5 sm:grid-cols-2", className)}>
      {datos.map(({ etiqueta, valor, ayuda }) => (
        <div key={etiqueta} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">
            {etiqueta}
          </dt>
          <dd className="min-w-0 text-sm break-words">
            {valor}
            {ayuda ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {ayuda}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function SinDato({ children = "—" }: { children?: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}
