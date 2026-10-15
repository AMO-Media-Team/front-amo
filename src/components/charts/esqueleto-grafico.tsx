import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

// Alturas fijas (no aleatorias): servidor y cliente pintan lo mismo.
const ALTURAS = [42, 58, 50, 72, 64, 80, 68, 88, 74, 92, 70, 84]

/** Área de trazado en carga: columnas con barrido de brillo sobre una base. */
export function EsqueletoAreaGrafico({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("flex size-full flex-col gap-3", className)}
    >
      <span className="sr-only">Cargando gráfico…</span>
      <div className="flex gap-3">
        <Esqueleto className="h-3 w-16" />
        <Esqueleto className="h-3 w-20" />
      </div>
      <div className="flex min-h-0 flex-1 items-end gap-2 border-b pb-px">
        {ALTURAS.map((altura, i) => (
          <Esqueleto
            key={i}
            className="flex-1 rounded-t-[4px] rounded-b-none"
            style={{ height: `${altura}%`, animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        {ALTURAS.slice(0, 6).map((_, i) => (
          <Esqueleto key={i} className="h-2.5 w-8" />
        ))}
      </div>
    </div>
  )
}

/**
 * Fallback fiel de una `TarjetaGrafico` para `<Suspense>` y `loading.tsx`:
 * mismo borde, relleno, encabezado y alto del área.
 */
export function EsqueletoTarjetaGrafico({
  alto = "min-h-72",
  className,
}: {
  alto?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Anchos en %, con tope: un ancho fijo impone su mínimo a la
            rejilla y desborda la página en móvil. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Esqueleto className="h-4 w-1/2 max-w-44" />
          <Esqueleto className="h-3 w-11/12 max-w-64" />
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Esqueleto className="size-7 rounded-lg" />
          <Esqueleto className="size-7 rounded-lg" />
          <Esqueleto className="size-7 rounded-lg" />
        </div>
      </div>
      <div className={cn("relative flex-auto", alto)}>
        <div className="absolute inset-0">
          <EsqueletoAreaGrafico />
        </div>
      </div>
    </div>
  )
}
