import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/** Anchos fijos (no aleatorios): servidor y cliente pintan lo mismo. */
const LINEAS = ["w-11/12", "w-4/5", "w-10/12"] as const

/**
 * Fallback fiel de `PanelInsights` para `<Suspense>` y `loading.tsx`: mismo
 * borde, encabezado y forma de cada hallazgo (icono, título, detalle y acción).
 */
export function EsqueletoPanelInsights({
  cantidad = 3,
  className,
}: {
  cantidad?: number
  className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <span className="sr-only">Cargando hallazgos…</span>
      <div className="flex items-start justify-between gap-3">
        {/* Anchos en %, con tope: un ancho fijo impone su mínimo a la
            rejilla y desborda la página en móvil. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Esqueleto className="h-4 w-1/2 max-w-48" />
          <Esqueleto className="h-3 w-11/12 max-w-64" />
        </div>
        <Esqueleto className="h-5 w-7 shrink-0 rounded-full" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: cantidad }, (_, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-lg border bg-background/40 p-3 pl-4"
          >
            <Esqueleto className="size-8 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
              <Esqueleto className="h-3.5 w-3/5" />
              <Esqueleto className={cn("h-3", LINEAS[i % LINEAS.length])} />
              <Esqueleto className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
