import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoNavegacionValidacion } from "@/features/validacion/components/navegacion-validacion"
import { EsqueletoCola } from "@/features/verificacion/components/esqueletos"

/** Carga de la validación: encabezado, las colas y la cola activa. */
export default function CargandoValidacion() {
  return (
    <ContenedorPagina>
      <div aria-hidden className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-40" />
        <Esqueleto className="h-4 w-full max-w-2xl" />
      </div>
      <EsqueletoNavegacionValidacion />
      <div aria-hidden className="flex flex-col gap-1.5">
        <Esqueleto className="h-6 w-32" />
        <Esqueleto className="h-4 w-96 max-w-full" />
      </div>
      <EsqueletoCola etiqueta="Cargando la cola…" />
    </ContenedorPagina>
  )
}
