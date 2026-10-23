import { Esqueleto } from "@/components/feedback/esqueletos"

/** Carga fiel de la pestaña «Seguimiento»: encabezado, filtro y tres tarjetas. */
export function EsqueletoSeguimiento() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando el seguimiento de la campaña…</span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-5 w-56" />
          <Esqueleto className="h-3.5 w-72 max-w-full" />
        </div>
        <Esqueleto className="h-7 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, indice) => (
          <Esqueleto key={indice} className="h-14 rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, indice) => (
        <div
          key={indice}
          className="flex flex-col gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-4 w-40" />
              <Esqueleto className="h-3 w-28" />
            </div>
            <Esqueleto className="h-6 w-24 rounded-full" />
          </div>
          <Esqueleto className="h-4 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, dato) => (
              <div key={dato} className="flex flex-col gap-1.5">
                <Esqueleto className="h-3 w-16" />
                <Esqueleto className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
