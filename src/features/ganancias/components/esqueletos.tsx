import { Esqueleto } from "@/components/feedback/esqueletos"

/** Fallback fiel de `ResumenGanancias`: cifra principal, cuatro montos y la regla. */
export function EsqueletoResumenGanancias() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6"
    >
      <span className="sr-only">Cargando el resumen de tus ganancias…</span>
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-4 w-32" />
        <Esqueleto className="h-10 w-56 max-w-full sm:h-12" />
        <Esqueleto className="h-3 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((indice) => (
          <div
            key={indice}
            className="flex flex-col gap-2 rounded-xl border p-3 sm:p-4"
          >
            <Esqueleto className="h-3 w-3/5" />
            <Esqueleto className="h-6 w-4/5" />
            <Esqueleto className="h-2.5 w-full" />
          </div>
        ))}
      </div>
      <Esqueleto className="h-4 w-80 max-w-full" />
    </div>
  )
}

function EsqueletoTarjetaPago() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-14" />
          <Esqueleto className="h-5 w-36" />
        </div>
        <Esqueleto className="h-6 w-28 rounded-full" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-20" />
          <Esqueleto className="h-7 w-32" />
        </div>
        <Esqueleto className="h-3 w-24" />
      </div>
      <div className="flex flex-col gap-2 border-t pt-3">
        <Esqueleto className="h-4 w-48" />
        <Esqueleto className="h-8 w-40" />
      </div>
    </div>
  )
}

/** Fallback de «Tus pagos»: tarjetas (en una columna también en escritorio). */
export function EsqueletoPagos() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando tus pagos…</span>
      {[0, 1, 2].map((indice) => (
        <EsqueletoTarjetaPago key={indice} />
      ))}
    </div>
  )
}

/** Fallback de un bloque lateral (por liquidar, condición tributaria). */
export function EsqueletoBloque({ filas = 3 }: { filas?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-1.5">
        <Esqueleto className="h-4 w-36" />
        <Esqueleto className="h-3 w-56 max-w-full" />
      </div>
      {Array.from({ length: filas }, (_, indice) => (
        <div key={indice} className="flex items-center justify-between gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Esqueleto className="h-4 w-3/4" />
            <Esqueleto className="h-3 w-1/2" />
          </div>
          <Esqueleto className="h-4 w-20" />
        </div>
      ))}
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

/** Fallback del cuerpo del detalle: desglose y publicaciones; pago y documento. */
export function EsqueletoDetalleLiquidacion() {
  return (
    <div role="status" aria-busy="true" className="grid gap-6 lg:grid-cols-2">
      <span className="sr-only">Cargando la liquidación…</span>
      <div className="flex flex-col gap-6">
        <EsqueletoTarjetaFicha alto="h-56" />
        <EsqueletoTarjetaFicha alto="h-40" />
      </div>
      <div className="flex flex-col gap-6">
        <EsqueletoTarjetaFicha alto="h-36" />
        <EsqueletoTarjetaFicha alto="h-32" />
      </div>
    </div>
  )
}

/** Fallback del desglose y las publicaciones (columna derecha del detalle). */
export function EsqueletoDesglose() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando el desglose…</span>
      <EsqueletoTarjetaFicha alto="h-56" />
      <EsqueletoTarjetaFicha alto="h-40" />
    </div>
  )
}

/** Cabecera de la ficha mientras llega: regreso, título y estado. */
export function EsqueletoCabeceraLiquidacion() {
  return (
    <div className="flex flex-col gap-4">
      <Esqueleto className="h-7 w-32" />
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-5 sm:p-6">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="h-8 w-56 max-w-full" />
        <Esqueleto className="h-4 w-64 max-w-full" />
        <Esqueleto className="mt-1 h-6 w-32 rounded-full" />
      </div>
    </div>
  )
}
