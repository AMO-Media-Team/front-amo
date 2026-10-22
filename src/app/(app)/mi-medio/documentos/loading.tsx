import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoDocumentos } from "@/features/documentos-medio/components/esqueleto-documentos"
import { EsqueletoEncabezadoSeccion } from "@/features/mi-medio/components/esqueletos"

export default function CargandoDocumentosMedio() {
  return (
    <ContenedorPagina>
      <EsqueletoEncabezadoSeccion />
      <EsqueletoDocumentos />
    </ContenedorPagina>
  )
}
