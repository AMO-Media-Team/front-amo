import { Esqueleto } from "@/components/feedback/esqueletos"

/** Tarjeta de un documento: icono, título con su estado, una línea y la acción. */
function TarjetaEsqueleto() {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <Esqueleto className="size-10 shrink-0 rounded-xl" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Esqueleto className="h-4 w-2/5 min-w-28" />
            <Esqueleto className="h-5 w-20 rounded-full" />
          </div>
          <Esqueleto className="h-3.5 w-11/12" />
        </div>
      </div>
      <div className="flex justify-end">
        <Esqueleto className="h-10 w-full rounded-lg sm:w-28" />
      </div>
    </li>
  )
}

/**
 * Esqueleto fiel de «Mis documentos»: la misma rejilla del panel (resumen y
 * nivel a un lado, tarjetas al otro) para que la página no salte al llegar
 * los datos. Se anuncia una sola vez a los lectores de pantalla.
 */
export function EsqueletoDocumentos() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8"
    >
      <span className="sr-only">Cargando tus documentos…</span>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <Esqueleto className="size-10 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-5 w-4/5" />
              <Esqueleto className="h-3.5 w-3/5" />
            </div>
          </div>
          <Esqueleto className="h-1.5 w-full rounded-full" />
          <div className="flex gap-1.5">
            <Esqueleto className="h-5 w-24 rounded-full" />
            <Esqueleto className="h-5 w-20 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <Esqueleto className="h-4 w-36" />
          <Esqueleto className="h-12 w-full rounded-lg" />
          <Esqueleto className="h-4 w-1/2" />
          <Esqueleto className="h-3.5 w-full" />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <Esqueleto className="h-5 w-44" />
        <ul className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((indice) => (
            <TarjetaEsqueleto key={indice} />
          ))}
        </ul>
      </div>
    </div>
  )
}
