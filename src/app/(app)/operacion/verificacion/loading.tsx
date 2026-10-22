import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoCola } from "@/features/verificacion/components/esqueletos"
import { EsqueletoNavegacionColas } from "@/features/verificacion/components/navegacion-colas"

/** Carga de las colas de verificación: encabezado, contadores y la cola. */
export default function CargandoVerificacion() {
  return (
    <ContenedorPagina>
      <div aria-hidden className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-44" />
        <Esqueleto className="h-4 w-full max-w-xl" />
      </div>
      <EsqueletoNavegacionColas />
      <EsqueletoCola etiqueta="Cargando la verificación…" />
    </ContenedorPagina>
  )
}
