import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

function EsqueletoTarjeta() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <Esqueleto className="h-4 w-32" />
        <Esqueleto className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Esqueleto className="h-3 w-28" />
        <Esqueleto className="h-5 w-3/4" />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-14" />
          <Esqueleto className="h-7 w-32" />
          <Esqueleto className="h-3 w-24" />
        </div>
        <Esqueleto className="h-3.5 w-28" />
      </div>
      <div className="flex flex-wrap gap-3 border-t pt-3">
        <Esqueleto className="h-6 w-40 rounded-full" />
        <Esqueleto className="h-4 w-36" />
      </div>
    </div>
  )
}

/** Carga del marketplace: filtros y una página de tarjetas. */
export function EsqueletoMarketplace() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando las ofertas…</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-20" />
          <Esqueleto className="h-10 w-full max-w-80 rounded-xl" />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Esqueleto className="h-10 w-52 rounded-xl" />
          <Esqueleto className="h-5 w-40" />
        </div>
      </div>
      {/* Sector, anunciante y días de publicación. */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {["sm:w-52", "sm:w-56", "col-span-2 sm:w-60"].map((ancho) => (
          <div key={ancho} className={cn("flex flex-col gap-1.5", ancho)}>
            <Esqueleto className="h-3 w-20" />
            <Esqueleto className="h-9 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Esqueleto className="h-4 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, indice) => (
          <EsqueletoTarjeta key={indice} />
        ))}
      </div>
    </div>
  )
}

/** Carga del detalle de una oferta: cabecera, pago, secciones y el pie. */
export function EsqueletoFichaOfertaMedio() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
    >
      <span className="sr-only">Cargando la oferta…</span>
      <Esqueleto className="h-7 w-24" />
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:p-6">
        <Esqueleto className="h-3 w-32" />
        <Esqueleto className="h-8 w-3/4" />
        <Esqueleto className="h-4 w-48" />
        <div className="mt-2 flex gap-2">
          <Esqueleto className="h-6 w-28 rounded-full" />
          <Esqueleto className="h-6 w-36 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <Esqueleto className="h-4 w-36" />
        <Esqueleto className="h-20 w-full rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((indice) => (
            <Esqueleto key={indice} className="h-12 w-full" />
          ))}
        </div>
      </div>
      {[4, 3].map((lineas, seccion) => (
        <div
          key={seccion}
          className="flex flex-col gap-3 rounded-xl border bg-card p-5"
        >
          <Esqueleto className="h-4 w-40" />
          {Array.from({ length: lineas }, (_, indice) => (
            <Esqueleto key={indice} className="h-3.5 w-full max-w-lg" />
          ))}
        </div>
      ))}
      <div className="flex justify-end gap-2 rounded-2xl border p-2">
        <Esqueleto className="h-10 w-32" />
        <Esqueleto className="h-10 w-28" />
      </div>
    </div>
  )
}
