import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

// Anchos fijos (no aleatorios) para que servidor y cliente pinten lo mismo.
const ANCHOS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5", "w-3/5"]

interface EsqueletoTablaDatosProps {
  columnas?: number
  filas?: number
  /** Cantidad de filtros facetados de la barra. */
  filtros?: number
  className?: string
}

/**
 * Carga inicial de `TablaDatos` (fallback de `<Suspense>`): misma barra,
 * tarjeta, cabecera y paginación, para que al llegar los datos nada salte.
 * En móvil imita la vista de tarjetas.
 */
export function EsqueletoTablaDatos({
  columnas = 5,
  filas = 8,
  filtros = 2,
  className,
}: EsqueletoTablaDatosProps) {
  const plantilla = {
    gridTemplateColumns: `2.5rem repeat(${columnas}, minmax(0, 1fr))`,
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("flex flex-col gap-3", className)}
    >
      <span className="sr-only">Cargando tabla…</span>
      <div className="flex flex-wrap items-center gap-2">
        <Esqueleto className="h-8 w-full sm:w-72" />
        {Array.from({ length: filtros }, (_, i) => (
          <Esqueleto key={i} className="h-7 w-24" />
        ))}
        <Esqueleto className="ml-auto h-7 w-20 max-sm:hidden" />
        <Esqueleto className="h-7 w-24 max-sm:hidden" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card max-md:hidden">
        <div
          className="grid gap-4 border-b bg-muted/40 px-4 py-3"
          style={plantilla}
        >
          <Esqueleto className="size-4" />
          {Array.from({ length: columnas }, (_, c) => (
            <Esqueleto key={c} className="h-3.5 w-2/3" />
          ))}
        </div>
        {Array.from({ length: filas }, (_, f) => (
          <div
            key={f}
            className="grid items-center gap-4 border-b px-4 py-3 last:border-b-0"
            style={plantilla}
          >
            <Esqueleto className="size-4" />
            {Array.from({ length: columnas }, (_, c) =>
              c === 0 ? (
                <div key={c} className="flex items-center gap-3">
                  <Esqueleto className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Esqueleto className="h-3.5 w-3/4" />
                    <Esqueleto className="h-3 w-1/2" />
                  </div>
                </div>
              ) : (
                <Esqueleto
                  key={c}
                  className={cn("h-4", ANCHOS[(f + c * 2) % ANCHOS.length])}
                />
              )
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <Esqueleto className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Esqueleto className="h-4 w-2/3" />
                <Esqueleto className="h-3 w-1/2" />
              </div>
            </div>
            <Esqueleto className="h-3.5 w-5/6" />
            <Esqueleto className="h-3.5 w-3/5" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Esqueleto className="h-4 w-28" />
        <Esqueleto className="h-7 w-52" />
      </div>
    </div>
  )
}
