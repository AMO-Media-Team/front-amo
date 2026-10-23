import { Esqueleto } from "@/components/feedback/esqueletos"
import { MarcoEsqueleto } from "@/features/dashboard/components/esqueletos-panel"

/** Fallback fiel de `CalidadCuentas`: una cuenta con su multiplicador y su explicación. */
export function EsqueletoCalidadCuentas({ className }: { className?: string }) {
  return (
    <MarcoEsqueleto className={className}>
      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Esqueleto className="h-4 w-3/5 max-w-40" />
            <Esqueleto className="h-3 w-4/5 max-w-52" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Esqueleto className="h-2.5 w-20" />
            <Esqueleto className="h-6 w-16" />
          </div>
        </div>
        <Esqueleto className="h-6 w-40 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-full" />
          <Esqueleto className="h-3 w-11/12" />
          <Esqueleto className="h-3 w-2/3" />
        </div>
      </div>
      <Esqueleto className="h-9 w-full" />
    </MarcoEsqueleto>
  )
}
