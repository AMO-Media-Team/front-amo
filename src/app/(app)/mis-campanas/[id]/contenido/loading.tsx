import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { EsqueletoContenido } from "@/features/mis-campanas/components/esqueletos"

/** Carga de «Contenido»: el regreso, el encabezado y el contenido. */
export default function CargandoContenido() {
  return (
    <ContenedorPagina>
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-7 w-40" />
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-24" />
          <Esqueleto className="h-8 w-72 max-w-full" />
          <Esqueleto className="h-4 w-80 max-w-full" />
        </div>
      </div>
      <EsqueletoContenido />
    </ContenedorPagina>
  )
}
