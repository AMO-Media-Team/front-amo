import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoCola } from "@/features/verificacion/components/esqueletos"

/** Carga de la moderación: encabezado y la cola. */
export default function CargandoModeracion() {
  return (
    <ContenedorPagina>
      <div aria-hidden className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-44" />
        <Esqueleto className="h-4 w-full max-w-xl" />
      </div>
      <div aria-hidden className="flex flex-col gap-1.5">
        <Esqueleto className="h-5 w-28" />
        <Esqueleto className="h-4 w-80 max-w-full" />
      </div>
      <EsqueletoCola etiqueta="Cargando la cola de moderación…" />
    </ContenedorPagina>
  )
}
