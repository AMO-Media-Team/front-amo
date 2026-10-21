import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

// Anchos fijos (no aleatorios): servidor y cliente pintan lo mismo.
const ANCHOS_TITULO = ["w-44", "w-56", "w-40", "w-52"]
const ANCHOS_TEXTO = ["w-4/5", "w-3/5", "w-2/3", "w-3/4"]

function FilaEsqueleto({ indice }: { indice: number }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Esqueleto
          className={cn("h-4", ANCHOS_TITULO[indice % ANCHOS_TITULO.length])}
        />
        <Esqueleto
          className={cn(
            "h-3.5 max-w-full",
            ANCHOS_TEXTO[indice % ANCHOS_TEXTO.length]
          )}
        />
        <Esqueleto className="h-3 w-48 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        <Esqueleto className="h-5 w-20" />
        <Esqueleto className="h-7 w-20 rounded-lg" />
      </div>
    </div>
  )
}

function BloqueEsqueleto({ filas }: { filas: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex gap-3 border-b px-4 py-3.5 sm:px-5">
        <Esqueleto className="size-8 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Esqueleto className="h-4 w-48 max-w-full" />
          <Esqueleto className="h-3.5 w-96 max-w-full" />
        </div>
      </div>
      <div className="flex flex-col divide-y">
        {Array.from({ length: filas }, (_, indice) => (
          <FilaEsqueleto key={indice} indice={indice} />
        ))}
      </div>
    </div>
  )
}

/** Carga de una sección: tarjetas de grupo con sus filas de parámetros. */
export function EsqueletoSeccion() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando la configuración…</span>
      <BloqueEsqueleto filas={2} />
      <BloqueEsqueleto filas={3} />
      <BloqueEsqueleto filas={2} />
    </div>
  )
}

/** Carga del título de la sección (solo en `loading.tsx`). */
export function EsqueletoEncabezadoSeccion() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      <Esqueleto className="h-6 w-40" />
      <Esqueleto className="h-4 w-[32rem] max-w-full" />
    </div>
  )
}

/** Carga de la navegación: pastillas en móvil y lista agrupada en escritorio. */
export function EsqueletoNavegacion() {
  return (
    <div aria-hidden className="min-w-0">
      <div className="flex gap-1.5 overflow-hidden @4xl:hidden">
        {Array.from({ length: 5 }, (_, indice) => (
          <Esqueleto key={indice} className="h-9 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="hidden flex-col gap-5 @4xl:flex">
        {[5, 3, 2].map((cantidad, grupo) => (
          <div key={grupo} className="flex flex-col gap-2">
            <Esqueleto className="ml-3 h-3 w-20" />
            {Array.from({ length: cantidad }, (_, indice) => (
              <div key={indice} className="flex items-center gap-3 px-3 py-1.5">
                <Esqueleto className="size-7 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Esqueleto className="h-3.5 w-24" />
                  <Esqueleto className="h-3 w-36" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
