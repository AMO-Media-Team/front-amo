import { Esqueleto } from "@/components/feedback/esqueletos"

/** «Asignaciones en curso por revisar» de un medio suspendido mientras llega. */
export function EsqueletoEnCurso() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col rounded-xl border bg-card"
    >
      <span className="sr-only">Cargando sus asignaciones en curso…</span>
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <Esqueleto className="size-8 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Esqueleto className="h-4 w-56 max-w-full" />
          <Esqueleto className="h-3 w-full max-w-md" />
        </div>
      </div>
      <div className="grid gap-2 p-5 lg:grid-cols-2">
        <Esqueleto className="h-24 rounded-lg" />
        <Esqueleto className="h-24 rounded-lg" />
      </div>
    </div>
  )
}

/** Pestañas «Disputas» y «Alertas» mientras llegan (tarjeta con su lista). */
export function EsqueletoListaFicha({
  etiqueta,
  cantidad = 3,
}: {
  etiqueta: string
  cantidad?: number
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col rounded-xl border bg-card"
    >
      <span className="sr-only">{etiqueta}</span>
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <Esqueleto className="size-8 shrink-0 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Esqueleto className="h-4 w-48 max-w-full" />
          <Esqueleto className="h-3 w-72 max-w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        {Array.from({ length: cantidad }, (_, indice) => (
          <Esqueleto key={indice} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
