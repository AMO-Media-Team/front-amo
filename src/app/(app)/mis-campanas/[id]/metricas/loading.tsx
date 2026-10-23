import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoEjecucion } from "@/features/ejecucion/components/esqueleto-ejecucion"

export default function CargandoMetricas() {
  return (
    <ContenedorPagina ancho="estrecho" className="gap-5">
      <EsqueletoEjecucion secciones={3} />
    </ContenedorPagina>
  )
}
