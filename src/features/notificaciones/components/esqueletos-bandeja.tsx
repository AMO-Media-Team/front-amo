import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/** Lista en carga: encabezado de día y filas con icono, título y mensaje. */
export function EsqueletoListaBandeja({ filas = 6 }: { filas?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="overflow-hidden rounded-2xl border bg-card"
    >
      <span className="sr-only">Cargando tus notificaciones…</span>
      <div className="border-b px-4 py-2.5 sm:px-5">
        <Esqueleto className="h-3 w-16" />
      </div>
      <div className="flex flex-col divide-y">
        {Array.from({ length: filas }, (_, indice) => (
          <div key={indice} className="flex gap-3.5 px-4 py-4 sm:px-5">
            <Esqueleto className="size-9 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2 pt-0.5">
              <div className="flex justify-between gap-4">
                <Esqueleto
                  className={cn("h-3.5", indice % 2 ? "w-1/2" : "w-2/3")}
                />
                <Esqueleto className="h-3 w-14" />
              </div>
              <Esqueleto className="h-3 w-full" />
              <Esqueleto className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EsqueletoRiel() {
  return (
    <div className="hidden flex-col gap-6 lg:flex">
      {[3, 8].map((cantidad, grupo) => (
        <div key={grupo} className="flex flex-col gap-2">
          <Esqueleto className="mx-2.5 h-3 w-14" />
          {Array.from({ length: cantidad }, (_, indice) => (
            <div
              key={indice}
              className="flex items-center gap-2.5 px-2.5 py-1.5"
            >
              <Esqueleto className="size-7 rounded-lg" />
              <Esqueleto
                className={cn("h-3.5", indice % 3 ? "w-24" : "w-32")}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Carga de la página completa (encabezado, filtros y lista). */
export function EsqueletoBandeja() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-44 sm:h-8" />
          <Esqueleto className="h-4 w-80 max-w-full" />
        </div>
        <Esqueleto className="h-8 w-52" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <EsqueletoRiel />
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap justify-between gap-2 lg:hidden">
            <Esqueleto className="h-9 w-64 rounded-xl" />
            <Esqueleto className="h-9 w-40 rounded-xl" />
          </div>
          <EsqueletoListaBandeja />
        </div>
      </div>
    </div>
  )
}
