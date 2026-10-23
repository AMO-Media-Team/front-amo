import { type ReactNode, useId } from "react"

/** Bloque titulado de los formularios de ejecución (región con nombre). */
export function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-base font-semibold">
          {titulo}
        </h2>
        {descripcion ? (
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}
