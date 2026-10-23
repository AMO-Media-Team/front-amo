import { Esqueleto } from "@/components/feedback/esqueletos"

/** Lo que ocupa el panel creativo mientras se lee la oferta. */
export function EsqueletoCreativo() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando el paquete creativo…</span>
      <Esqueleto className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Esqueleto className="aspect-square rounded-xl" />
        <Esqueleto className="aspect-square rounded-xl" />
        <Esqueleto className="hidden aspect-square rounded-xl sm:block" />
      </div>
      <Esqueleto className="h-28 w-full rounded-lg" />
      <Esqueleto className="h-9 w-full rounded-lg" />
    </div>
  )
}
