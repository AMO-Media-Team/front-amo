import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

import { CLASE_LIENZO } from "./lienzo"

const FILAS_RANKING = 9

/**
 * Esqueleto fiel del explorador (loading.tsx y Suspense): lienzo con la
 * silueta de Colombia y los mismos paneles de vidrio. Cambia de disposición
 * con el ancho del contenedor (60 rem, igual que el explorador).
 */
export function EsqueletoExplorador({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "@container/mapa relative overflow-hidden bg-background",
        CLASE_LIENZO,
        className
      )}
    >
      <span className="sr-only">Cargando el explorador geográfico…</span>
      <div aria-hidden className="absolute inset-0 patron-puntos opacity-60" />
      <div
        aria-hidden
        className="absolute top-1/2 left-1/2 aspect-[3/4] h-[58%] max-w-[78%] -translate-1/2 esqueleto-shimmer rounded-[42%_38%_46%_40%] opacity-40 @min-[60rem]/mapa:left-[58%]"
      />

      {/* Móvil y tableta: barra única arriba; leyenda y ranking abajo. */}
      <div className="absolute inset-0 flex flex-col justify-between p-3 @min-[60rem]/mapa:hidden">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 rounded-2xl vidrio p-2">
          <div className="flex items-center gap-2 px-1">
            <Esqueleto className="h-4 w-40" />
            <Esqueleto className="ml-auto size-8 rounded-xl" />
          </div>
          <div className="flex items-center gap-1.5">
            <Esqueleto className="h-9 flex-1 rounded-xl" />
            <Esqueleto className="size-9 rounded-xl" />
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-2 rounded-2xl vidrio p-3">
            <Esqueleto className="h-2.5 w-16" />
            <Esqueleto className="h-2.5 w-44 rounded-full" />
          </div>
          <Esqueleto className="mb-[4.25rem] h-10 w-28 rounded-xl" />
        </div>
      </div>

      {/* Escritorio: encabezado y herramientas; ranking a la izquierda. */}
      <div className="absolute inset-0 hidden flex-col gap-3 p-4 @min-[60rem]/mapa:flex">
        <div className="flex items-start justify-between gap-3">
          <div className="flex w-[21rem] flex-col gap-2.5 rounded-2xl vidrio px-5 py-4">
            <Esqueleto className="h-4 w-44" />
            <Esqueleto className="h-3 w-36" />
          </div>
          <div className="flex items-center gap-1.5 rounded-2xl vidrio p-1.5">
            <Esqueleto className="h-9 w-60 rounded-xl" />
            <Esqueleto className="h-9 w-40 rounded-xl" />
            <Esqueleto className="size-9 rounded-xl" />
            <Esqueleto className="size-9 rounded-xl" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex w-[21rem] flex-col gap-3 rounded-2xl vidrio p-4">
            <Esqueleto className="h-3 w-44" />
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="h-7 w-32" />
            <div className="mt-3 flex flex-col gap-4">
              {Array.from({ length: FILAS_RANKING }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Esqueleto className="size-6 rounded-md" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Esqueleto className="h-3 w-3/5" />
                    <Esqueleto className="h-1 w-full rounded-full" />
                  </div>
                  <Esqueleto className="h-3 w-10" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-1 items-end">
            <div className="flex flex-col gap-2 rounded-2xl vidrio p-3">
              <Esqueleto className="h-2.5 w-16" />
              <Esqueleto className="h-2.5 w-52 rounded-full" />
            </div>
          </div>
          <div className="flex items-end pb-7">
            <div className="flex flex-col gap-1 rounded-xl vidrio p-1">
              <Esqueleto className="size-8" />
              <Esqueleto className="size-8" />
              <Esqueleto className="size-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
