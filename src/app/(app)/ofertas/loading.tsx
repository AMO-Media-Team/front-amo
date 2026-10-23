import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EsqueletoMarketplace } from "@/features/marketplace/components/esqueletos"
import { DESCRIPCION_MARKETPLACE } from "@/features/marketplace/presentacion"

/**
 * Carga de «Ofertas»: el encabezado ya es el definitivo y la lista, un
 * esqueleto fiel. `[id]/` tiene el suyo (el del detalle).
 */
export default function CargandoOfertas() {
  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Ofertas"
        descripcion={DESCRIPCION_MARKETPLACE}
      />
      <EsqueletoMarketplace />
    </ContenedorPagina>
  )
}
