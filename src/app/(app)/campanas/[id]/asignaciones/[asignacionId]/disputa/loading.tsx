import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoEjecucion } from "@/features/ejecucion/components/esqueleto-ejecucion"

export default function CargandoDisputaAnunciante() {
  return (
    <ContenedorPagina ancho="estrecho" className="gap-5">
      <EsqueletoEjecucion secciones={2} />
    </ContenedorPagina>
  )
}
