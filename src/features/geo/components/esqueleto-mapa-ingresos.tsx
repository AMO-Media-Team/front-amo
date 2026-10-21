import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/**
 * Silueta de la tarjeta "Mapa de ingresos": misma caja y mismas columnas que
 * la real (planisferio y, con espacio, Colombia a su derecha).
 */
export function EsqueletoMapaIngresos({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "@container/ingresos flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Esqueleto className="size-8 rounded-lg" />
          <div className="flex flex-col gap-1.5">
            <Esqueleto className="h-4 w-32" />
            <Esqueleto className="h-3 w-56 max-w-full" />
          </div>
        </div>
        <Esqueleto className="h-8 w-40 rounded-lg @4xl/ingresos:hidden" />
      </div>
      <div className="grid items-start gap-x-8 gap-y-4 @4xl/ingresos:grid-cols-[minmax(0,1fr)_minmax(0,0.3175fr)]">
        <div className="flex flex-col gap-3">
          <Esqueleto className="hidden h-3 w-28 @4xl/ingresos:block" />
          <Esqueleto className="aspect-[1000/435] w-full rounded-xl" />
          <Esqueleto className="h-3 w-64 max-w-full" />
        </div>
        <div className="hidden flex-col gap-3 @4xl/ingresos:flex">
          <Esqueleto className="h-3 w-36 max-w-full" />
          <Esqueleto className="aspect-[1000/1370] w-full rounded-xl" />
          <Esqueleto className="h-3 w-full" />
        </div>
      </div>
    </div>
  )
}
