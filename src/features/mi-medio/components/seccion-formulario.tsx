import type { LucideIcon } from "lucide-react"
import { type ReactNode, useId } from "react"

import { cn } from "@/lib/utils"

/**
 * Tarjeta de una parte de los formularios de «Mi medio» (perfil, pago):
 * encabezado con ícono y explicación, y los campos debajo. Sin
 * `overflow: hidden`, para no anular la barra pegajosa de guardar.
 */
export function SeccionFormulario({
  titulo,
  descripcion,
  icono: Icono,
  children,
  className,
}: {
  titulo: string
  descripcion?: ReactNode
  icono: LucideIcon
  children: ReactNode
  className?: string
}) {
  const idTitulo = useId()
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "flex flex-col gap-5 rounded-2xl border bg-card p-4 shadow-xs sm:p-6",
        className
      )}
    >
      <header className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"
        >
          <Icono className="size-[1.125rem]" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id={idTitulo}
            className="font-heading text-base leading-snug font-semibold"
          >
            {titulo}
          </h2>
          {descripcion ? (
            <p className="text-sm text-pretty text-muted-foreground">
              {descripcion}
            </p>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  )
}
