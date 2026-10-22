import { Esqueleto } from "@/components/feedback/esqueletos"

/** Tarjetas de una cola mientras llega (misma altura que las reales). */
export function EsqueletoCola({
  etiqueta = "Cargando la cola…",
  cantidad = 3,
}: {
  etiqueta?: string
  cantidad?: number
}) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{etiqueta}</span>
      {Array.from({ length: cantidad }, (_, indice) => (
        <div
          key={indice}
          className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Esqueleto className="size-11 shrink-0 rounded-xl" />
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-4 w-44" />
              <Esqueleto className="h-3 w-56 max-w-[60vw]" />
              <Esqueleto className="h-3 w-32" />
            </div>
          </div>
          <Esqueleto className="h-9 w-full rounded-lg sm:w-28" />
        </div>
      ))}
    </div>
  )
}

/** Pestaña «Verificación» de la ficha mientras llega el expediente. */
export function EsqueletoExpediente() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 lg:grid-cols-5">
      <span className="sr-only">Cargando el expediente de verificación…</span>
      <div className="flex flex-col gap-4 lg:col-span-3">
        <Esqueleto className="h-80 rounded-xl" />
        <Esqueleto className="h-72 rounded-xl" />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Esqueleto className="h-56 rounded-xl" />
        <Esqueleto className="h-48 rounded-xl" />
      </div>
    </div>
  )
}

/** Pestaña «Pertinencia» mientras llega la tabla. */
export function EsqueletoPertinencia() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando la pertinencia geográfica…</span>
      <Esqueleto className="h-20 rounded-xl" />
      {[0, 1, 2].map((indice) => (
        <Esqueleto key={indice} className="h-16 rounded-xl" />
      ))}
    </div>
  )
}
