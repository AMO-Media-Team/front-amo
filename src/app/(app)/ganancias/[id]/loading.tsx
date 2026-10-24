import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import {
  EsqueletoCabeceraLiquidacion,
  EsqueletoDetalleLiquidacion,
} from "@/features/ganancias/components/esqueletos"

/** Carga del detalle de una liquidación: cabecera, pago, documento y desglose. */
export default function CargandoLiquidacionMedio() {
  return (
    <ContenedorPagina>
      <EsqueletoCabeceraLiquidacion />
      <EsqueletoDetalleLiquidacion />
    </ContenedorPagina>
  )
}
