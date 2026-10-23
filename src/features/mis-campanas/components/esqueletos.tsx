import { Esqueleto } from "@/components/feedback/esqueletos"

function EsqueletoTarjeta() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <Esqueleto className="h-4 w-28" />
        <Esqueleto className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Esqueleto className="h-3 w-32" />
        <Esqueleto className="h-5 w-3/4" />
      </div>
      <div className="flex flex-col gap-2.5 rounded-xl border p-3">
        <div className="flex items-center gap-2.5">
          <Esqueleto className="size-8 rounded-lg" />
          <Esqueleto className="h-4 w-40" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Esqueleto className="h-6 w-28 rounded-full" />
          <Esqueleto className="h-7 w-32" />
        </div>
      </div>
      <div className="flex justify-between border-t pt-3">
        <Esqueleto className="h-3.5 w-16" />
        <Esqueleto className="h-4 w-24" />
      </div>
    </div>
  )
}

/** Carga del tablero: el resumen, los segmentos y una fila de tarjetas. */
export function EsqueletoTablero() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando tus campañas…</span>
      <Esqueleto className="h-4 w-64" />
      <div className="flex flex-wrap gap-2">
        {[28, 46, 34, 24, 26, 40].map((ancho, indice) => (
          <Esqueleto
            key={indice}
            className="h-9 rounded-full"
            style={{ width: `${ancho * 4}px` }}
          />
        ))}
      </div>
      <Esqueleto className="h-4 w-80 max-w-full" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, indice) => (
          <EsqueletoTarjeta key={indice} />
        ))}
      </div>
    </div>
  )
}

function EsqueletoTarjetaFicha({ alto }: { alto: string }) {
  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <Esqueleto className="size-8 rounded-lg" />
        <Esqueleto className="h-4 w-40" />
      </div>
      <div className="p-5">
        <Esqueleto className={`w-full rounded-lg ${alto}`} />
      </div>
    </div>
  )
}

/** Carga del cuerpo de la ficha: lo que sigue, el avance y sus secciones. */
export function EsqueletoCuerpoAsignacion() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando la campaña…</span>
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <Esqueleto className="h-3 w-24" />
        <div className="flex items-start gap-2.5">
          <Esqueleto className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Esqueleto className="h-5 w-56 max-w-full" />
            <Esqueleto className="h-4 w-full" />
          </div>
        </div>
        <Esqueleto className="h-6 w-32 rounded-full" />
      </div>
      <Esqueleto className="h-28 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <EsqueletoTarjetaFicha alto="h-48" />
          <EsqueletoTarjetaFicha alto="h-40" />
        </div>
        <div className="flex flex-col gap-6">
          <EsqueletoTarjetaFicha alto="h-44" />
          <EsqueletoTarjetaFicha alto="h-24" />
        </div>
      </div>
    </div>
  )
}

/** Carga de «Contenido»: instrucciones y el contenido. */
export function EsqueletoContenido() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando el contenido…</span>
      <EsqueletoTarjetaFicha alto="h-40" />
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <Esqueleto className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Esqueleto className="h-5 w-48" />
            <Esqueleto className="h-4 w-full" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Esqueleto className="h-[min(70vh,32rem)] w-full rounded-lg" />
          <div className="flex flex-col gap-2.5">
            <Esqueleto className="h-28 w-full rounded-xl" />
            <Esqueleto className="h-16 w-full rounded-xl" />
            <Esqueleto className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
