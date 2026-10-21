import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface SeccionCuentaProps {
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  /** Acciones junto al título (se apilan debajo en móvil). */
  acciones?: ReactNode
  /** Barra inferior: ayuda a la izquierda y botones a la derecha. */
  pie?: ReactNode
  children?: ReactNode
  className?: string
  /** Sin relleno interior (listas que llegan al borde). */
  sinRelleno?: boolean
  id?: string
}

/**
 * Tarjeta de ajustes de «Mi cuenta»: encabezado con icono, contenido y un pie
 * opcional para las acciones de guardar (patrón de páginas de configuración).
 */
export function SeccionCuenta({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  pie,
  children,
  className,
  sinRelleno = false,
  id,
}: SeccionCuentaProps) {
  const idTitulo = id ? `${id}-titulo` : undefined
  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      className={cn(
        "flex scroll-mt-20 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs",
        className
      )}
    >
      <header className="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icono ? (
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"
            >
              <Icono className="size-[1.125rem]" />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id={idTitulo} className="text-base leading-snug font-semibold">
              {titulo}
            </h2>
            {descripcion ? (
              <p className="text-sm text-muted-foreground">{descripcion}</p>
            ) : null}
          </div>
        </div>
        {acciones ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {acciones}
          </div>
        ) : null}
      </header>
      {children ? (
        <div
          className={cn(
            "flex-1",
            sinRelleno ? "pt-4" : "px-5 pt-5 pb-5 sm:px-6 sm:pb-6"
          )}
        >
          {children}
        </div>
      ) : (
        <div className="pb-5 sm:pb-6" />
      )}
      {pie ? (
        <footer className="flex flex-col-reverse gap-3 border-t bg-muted/30 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {pie}
        </footer>
      ) : null}
    </section>
  )
}

/**
 * Botones del pie: a lo ancho y apilados en móvil (el principal, último en el
 * código, queda arriba) y alineados a la derecha desde `sm`. Un botón suelto
 * en el pie ya se comporta así sin envoltura.
 */
export function AccionesPie({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      {children}
    </div>
  )
}
