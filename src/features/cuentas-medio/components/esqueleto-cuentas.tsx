import { Esqueleto } from "@/components/feedback/esqueletos"

function TarjetaCuenta() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Esqueleto className="size-8 rounded-lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Esqueleto className="h-5 w-40" />
          <div className="flex gap-2">
            <Esqueleto className="h-5 w-24 rounded-full" />
            <Esqueleto className="h-5 w-36" />
          </div>
        </div>
        <Esqueleto className="size-9 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: 4 }, (_, indice) => (
          <div key={indice} className="flex flex-col gap-1.5">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="h-4 w-32" />
          </div>
        ))}
      </div>
      <Esqueleto className="h-16 w-full rounded-lg" />
      <Esqueleto className="h-9 w-full rounded-lg sm:w-40" />
    </div>
  )
}

/** Esqueleto fiel de «Cuentas sociales»: resumen, guía y dos tarjetas. */
export function EsqueletoCuentas() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando tus cuentas sociales…</span>
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Esqueleto className="h-4 w-64 max-w-full" />
          <Esqueleto className="h-9 w-full rounded-lg sm:w-40" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }, (_, indice) => (
            <Esqueleto key={indice} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
      <Esqueleto className="h-12 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TarjetaCuenta />
        <TarjetaCuenta />
      </div>
    </div>
  )
}
