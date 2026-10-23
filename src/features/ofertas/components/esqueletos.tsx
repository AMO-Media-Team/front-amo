import { Esqueleto } from "@/components/feedback/esqueletos"

/** Mismas medidas que `ContenedorPagina` (el `loading.tsx` no lo usa: no anima). */
const CONTENEDOR =
  "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"

/** Columnas de la ficha: contenido y lateral (decisión o historial). */
export const COLUMNAS_FICHA_OFERTA =
  "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"

/**
 * Carga de la ficha de una oferta: cabecera, aviso del estado, resumen en
 * cuatro bloques, creativo y la columna lateral.
 */
export function EsqueletoFichaOferta({
  etiqueta = "Cargando la oferta…",
}: {
  etiqueta?: string
}) {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">{etiqueta}</span>
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-7 w-32" />
        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-5">
            <Esqueleto className="size-14 shrink-0 rounded-2xl sm:size-16" />
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-3 w-36" />
              <Esqueleto className="h-7 w-64 max-w-[60vw]" />
              <Esqueleto className="h-4 w-52 max-w-[50vw]" />
              <div className="mt-1 flex gap-2">
                <Esqueleto className="h-6 w-24 rounded-full" />
                <Esqueleto className="h-6 w-32 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Esqueleto className="h-9 w-36" />
            <Esqueleto className="h-9 w-24" />
          </div>
        </div>
        <Esqueleto className="h-24 rounded-xl" />
      </div>
      <div className={COLUMNAS_FICHA_OFERTA}>
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {[0, 1, 2, 3].map((indice) => (
              <Esqueleto key={indice} className="h-64 rounded-xl" />
            ))}
          </div>
          <Esqueleto className="h-80 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-56 rounded-xl" />
          <Esqueleto className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
